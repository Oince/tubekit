"""iOS 시뮬레이터 Safari용 최소 웹 인스펙터 클라이언트 (검증 도구, 배포물에 포함되지 않음).

시뮬레이터의 webinspectord_sim 유닉스 소켓(길이 접두 바이너리 plist)에 붙어
열린 Safari 탭에서 JavaScript를 실행한다. 사용법은 AGENTS.md 참고.

usage:
  python3 tools/sim-inspect.py pages
  python3 tools/sim-inspect.py eval [--match 주소일부] '<expression>'
  python3 tools/sim-inspect.py evalfile [--match 주소일부] tubekit.user.js

--match를 주지 않으면 주소에 youtube가 들어간 마지막 탭을 고른다.
"""
import glob, json, os, plistlib, socket, struct, sys, time, uuid

SOCKS = sorted(glob.glob('/private/var/tmp/com.apple.launchd.*/com.apple.webinspectord_sim.socket')
               + glob.glob('/private/tmp/com.apple.launchd.*/com.apple.webinspectord_sim.socket'),
               key=os.path.getmtime, reverse=True)
CONN = str(uuid.uuid4()).upper()
SENDER = str(uuid.uuid4()).upper()


class Client:
    def __init__(self):
        for path in SOCKS:
            self.s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            try:
                self.s.connect(path)
                break
            except OSError:
                self.s.close()
        else:
            raise SystemExit('no live webinspectord_sim socket')
        self.s.settimeout(0.3)
        self.buf = b''

    def send(self, selector, arg):
        arg = dict(arg, WIRConnectionIdentifierKey=CONN)
        data = plistlib.dumps({'__selector': selector, '__argument': arg}, fmt=plistlib.FMT_BINARY)
        self.s.sendall(struct.pack('>I', len(data)) + data)

    def recv_all(self, wait):
        """Collect messages for up to `wait` seconds."""
        out, end = [], time.time() + wait
        while time.time() < end:
            try:
                chunk = self.s.recv(1 << 20)
                if not chunk:
                    break
                self.buf += chunk
            except socket.timeout:
                pass
            while len(self.buf) >= 4:
                n = struct.unpack('>I', self.buf[:4])[0]
                if len(self.buf) < 4 + n:
                    break
                out.append(plistlib.loads(self.buf[4:4 + n]))
                self.buf = self.buf[4 + n:]
        return out

    def until(self, pred, wait):
        end = time.time() + wait
        got = []
        while time.time() < end:
            for m in self.recv_all(0.3):
                got.append(m)
                if pred(m):
                    return m, got
        return None, got


def list_pages(c):
    c.send('_rpc_reportIdentifier:', {})
    c.send('_rpc_getConnectedApplications:', {})
    m, _ = c.until(lambda m: m['__selector'] == '_rpc_reportConnectedApplicationList:', 5)
    apps = m['__argument'].get('WIRApplicationDictionaryKey', {}) if m else {}
    for app_id in apps:
        c.send('_rpc_forwardGetListing:', {'WIRApplicationIdentifierKey': app_id})
    pages = []
    for msg in c.recv_all(2.0):
        if msg['__selector'] == '_rpc_applicationSentListing:':
            a = msg['__argument']
            for p in a.get('WIRListingKey', {}).values():
                pages.append({'app': a['WIRApplicationIdentifierKey'],
                              'bundle': apps.get(a['WIRApplicationIdentifierKey'], {}).get('WIRApplicationBundleIdentifierKey'),
                              'page': p.get('WIRPageIdentifierKey'), 'type': p.get('WIRTypeKey'),
                              'url': p.get('WIRURLKey'), 'title': p.get('WIRTitleKey')})
    return pages


def evaluate(c, page, expression):
    base = {'WIRApplicationIdentifierKey': page['app'], 'WIRPageIdentifierKey': page['page'], 'WIRSenderKey': SENDER}
    c.send('_rpc_forwardSocketSetup:', dict(base, WIRAutomaticallyPause=False))

    def data_msgs(msgs):
        for m in msgs:
            if m['__selector'] == '_rpc_applicationSentData:':
                yield json.loads(m['__argument']['WIRMessageDataKey'])

    target = None
    for d in data_msgs(c.recv_all(1.0)):
        if d.get('method') == 'Target.targetCreated':
            info = d['params']['targetInfo']
            if not info.get('isProvisional'):
                target = info['targetId']

    inner = {'id': 1, 'method': 'Runtime.evaluate',
             'params': {'expression': expression, 'returnByValue': True, 'emulateUserGesture': True}}
    if target:
        outer = {'id': 1000, 'method': 'Target.sendMessageToTarget',
                 'params': {'targetId': target, 'message': json.dumps(inner)}}
    else:
        outer = inner
    c.send('_rpc_forwardSocketData:', dict(base, WIRSocketDataKey=json.dumps(outer).encode()))
    end = time.time() + 60
    while time.time() < end:
        for d in data_msgs(c.recv_all(0.3)):
            if d.get('method') == 'Target.dispatchMessageFromTarget':
                d = json.loads(d['params']['message'])
            if d.get('id') == 1 and ('result' in d or 'error' in d):
                return d
    return {'error': 'timeout'}


def pick(pages, match):
    web = [p for p in pages if p['type'] in (None, 'WIRTypeWebPage', 'WIRTypePage')]
    if match:
        web = [p for p in web if match in (p['url'] or '')]
    return web[-1] if web else None


def main():
    args = sys.argv[1:]
    cmd = args.pop(0)
    match = 'youtube'
    if args[:1] == ['--match']:
        args.pop(0)
        match = args.pop(0)
    c = Client()
    pages = list_pages(c)
    if cmd == 'pages':
        print(json.dumps(pages, ensure_ascii=False, indent=1))
        return
    page = pick(pages, match)
    if not page:
        print(json.dumps({'error': 'no page', 'pages': pages}, ensure_ascii=False))
        sys.exit(1)
    expr = open(args[0]).read() if cmd == 'evalfile' else args[0]
    text, code, stream = report(evaluate(c, page, expr))
    print(text, file=sys.stderr if stream == 'stderr' else sys.stdout)
    if code:
        sys.exit(code)


def report(res):
    """evaluate 응답을 (출력 문자열, 종료 코드, 'stdout'|'stderr')로 판정한다."""
    if not isinstance(res, dict):
        return json.dumps({'error': 'unexpected response', 'response': res}, ensure_ascii=False)[:4000], 1, 'stderr'
    if res.get('error') is not None:
        return json.dumps({'error': res['error']}, ensure_ascii=False)[:4000], 1, 'stderr'
    outer = res.get('result')
    if not isinstance(outer, dict):
        return json.dumps({'error': 'no result', 'response': res}, ensure_ascii=False)[:4000], 1, 'stderr'
    r = outer.get('result', outer)
    if outer.get('wasThrown'):
        info = r.get('description') if isinstance(r, dict) else None
        if not info:
            info = json.dumps(r, ensure_ascii=False)
        return ('JavaScript exception: ' + str(info))[:4000], 1, 'stderr'
    return json.dumps(r.get('value', r) if isinstance(r, dict) else r, ensure_ascii=False)[:4000], 0, 'stdout'


if __name__ == '__main__':
    main()
