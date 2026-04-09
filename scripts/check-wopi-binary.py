import sys

with open("/var/www/onlyoffice/documentserver/server/DocService/docservice", "rb") as f:
    data = f.read()

searches = [
    b"hosting/wopi",
    b"wopiDiscovery",
    b"wopiCheckFileInfo",
    b"wopiGetFile",
    b"wopiPutFile",
    b"wopiLock",
    b"wopi/edit",
    b"wopi/view",
    b"WOPI_SOURCE",
    b"wopi.enable",
    b"wopiRouter",
    b"wopi-collabora",
]

for s in searches:
    pos = data.find(s)
    if pos >= 0:
        start = max(0, pos - 30)
        end = min(len(data), pos + len(s) + 50)
        context = data[start:end]
        printable = ""
        for b in context:
            if 32 <= b < 127:
                printable += chr(b)
            else:
                printable += "."
        print('FOUND "%s" at offset %d: ...%s...' % (s.decode(), pos, printable))
    else:
        print('NOT FOUND: "%s"' % s.decode())
