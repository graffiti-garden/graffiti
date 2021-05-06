#!/usr/bin/env python3

from our_data import OurData

TAGS = ['children']
DEFAULT = "524857d0148721c24e3e7795e19ade0cdcf49f2a4dfbef2f1575d1208fa8c54f"

def application(env, http):
    # Extract the URI components
    uri = env['REQUEST_URI'].split('/')
    uri = list(filter(None, uri))
    if not uri:
        http('307', [('Location', DEFAULT)])
        return

    # Parse out the address and tag
    addr = uri[0]
    uri_stripped = '/' + addr
    tag = ''
    if len(uri) > 1 and uri[1] in TAGS:
        tag = uri[1]
        uri_stripped += '/' + tag
    if uri_stripped != env['REQUEST_URI']:
        http('301', [('Location', uri_stripped)])
        return

    # Determine what media type to use
    accept = env['HTTP_ACCEPT']
    html_priority  =     media_priority('text/html' , accept)
    plain_priority = max(media_priority('text/plain', accept),
                         media_priority('text/*'    , accept),
                         media_priority('*/*'       , accept))
    if html_priority == plain_priority == 0:
        http('406', [('Content-Type', 'text/html')])
        title = "406 Not Acceptable"
        description = "No valid media type in \"%s\"" % accept
        return error_page(title, description, 'text/html')
    elif html_priority >= plain_priority:
        content_type = 'text/html'
    else:
        content_type = 'text/plain'
    headers = [('Vary', 'Accept'), ('Content-Type', content_type)]

    # Initialize the address, if valid
    try:
        addr_b = bytes.fromhex(addr)
        od = OurData(addr=addr_b)
    except ValueError:
        http('400', headers)
        title = "400 Bad Request"
        description = "Invalid address: " + addr
        return error_page(title, description, content_type)

    if tag == 'children':
        children = od.get_children()

        http('200', headers)
        if content_type == 'text/html':
            children_links = []
            for child in children:
                addr = child.hex()
                link = "<a href=../%s>%s<a>" % (addr, addr)
                children_links.append(link)
            return wrap_html('<br>'.join(children_links).encode())
        else:
            return ''.join(children)
    elif tag == '':
        # Fetch the data
        try:
            data = od.get_data()
        except:
            http('404', headers)
            title = "404 Not Found"
            description = "Nothing pinned at " + od.get_addr().hex()
            return error_page(title, description, content_type)

        http('200', headers)
        return wrap_html(data)

def media_priority(media, accept):
    start_index = accept.find(media)
    if start_index < 0:
        return 0.
    end_index = (accept + ',').find(',', start_index)
    content_type_q = accept[start_index:end_index].split(';')
    if len(content_type_q) > 1:
        return float(content_type_q[1].split('=')[1])
    else:
        return 1.

def wrap_html(text):
    return b"""\
<html>
<head>
<title>Ours Gateway</title>
<body>%s</body>
<html>""" % text

def error_page(title, description, content_type):
    ep = """\
<center>
<h1>%s</h1>
<hr>
%s
<br><br>
- Ours Gateway -
</center>""" % (title, description)
    if content_type == 'text/html':
        return wrap_html(ep.encode())
    else:
        return ep.encode()
