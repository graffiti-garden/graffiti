#!/usr/bin/env python3

from our_data import OurData

TAGS = ['children']
DEFAULT = "37c5145809c4f95a8dd3b317d06c252823142672b190b8c43e1333af1fb53d5b"

def application(env, http):
    request = env['REQUEST_METHOD']
    if request == 'PUT':
        return put(env, http)
    elif request == 'GET' or request == 'HEAD':
        return get(env, http)
    else:
        return error_page(http, '405',
                "Method Not Allowed",
                "Can't perform a %s request." % request)

def put(env, http):
    content_length = int(env['CONTENT_LENGTH'])
    data = env['wsgi.input'].read(content_length)
    uri = env['REQUEST_URI'].split('/')
    uri = list(filter(None, uri))
    if not uri:
        media_type = env['CONTENT_TYPE']
        try:
            od = OurData(data=data, media_type=media_type)
        except ValueError as e:
            return error_page(http, '415', "Unsupported Media Type", e)
        od.pin()
        http('200', [('Content-Type', 'text/html')])
        return od.get_addr().encode()
    else:
        addr = uri[0]
        try:
            od = OurData(addr=addr)
        except ValueError as e:
            return error_page(http, '400', "Bad Request", e)
        try:
            od.add_child(data.decode())
        except ValueError as e:
            return error_page(http, '415', "Unsupported Media Type", e)
        http('200', [('Content-Type', 'text/html')])
        return b"child added"

def get(env, http):
    # Extract the URI components
    uri = env['REQUEST_URI'].split('/')
    uri = list(filter(None, uri))
    if not uri:
        # If no address, redirect to the default page
        http('307', [('Location', DEFAULT)])
        return

    # Parse the address and tag
    addr = uri[0]
    uri_stripped = '/' + addr
    tag = ''
    if len(uri) > 1:
        tag = uri[1]
        uri_stripped += '/' + tag
    if uri_stripped != env['REQUEST_URI']:
        # If the address is dirty, redirect to it cleaned
        http('301', [('Location', uri_stripped)])
        return

    # Initialize the address, if valid
    try:
        od = OurData(addr=addr)
    except ValueError as e:
        return error_page(http, '400', "Bad Request", e)

    accept = env['HTTP_ACCEPT']
    if tag == 'children':
        return get_children(http, accept, od)
    elif tag == '':
        return get_data(http, accept, od)
    else:
        return error_page(http, '400', "Bad Request", "No extension \"%s\"" % tag)

def get_children(http, accept, od):
    children = od.get_children()

    media_type = max('text/ours', 'text/html',
                     key=lambda t: media_priority(accept, t))

    if media_type == 'text/html':
        children_links = ["<a href=../%s>%s<a>" % (c, c) for c in children]
        data = wrap('<br>'.join(children_links).encode())
    else:
        data= ','.join(children).encode()

    return data_out(http, accept, media_type, data)

def get_data(http, accept, od):
    try:
        media_type = od.get_media_type()
        data = od.get_data()
    except KeyError as e:
        return error_page(http, '404', "Not Found", e)

    # Wrap the html data if necessary
    if media_type == 'text/ours':
        ours_priority = media_priority(accept, 'text/ours')
        html_priority = media_priority(accept, 'text/html')
        if html_priority > ours_priority:
            data = wrap(data)
            media_type = 'text/html'

    return data_out(http, accept, media_type, data)

def data_out(http, accept, media_type, data):
    if media_priority(accept, media_type) == 0:
        return error_page(http, '406',
                "Not Acceptable"
                "Requested types are invalid: \"%s\"" % accept)

    headers = [('Vary', 'Accept'), ('Content-Type', media_type)]
    http('200', headers)
    return data

def media_priority(accept, media_type):
    t, subt = media_type.split('/')
    priority = 0.
    for t in [t+'/'+subt, t+'/*', '*/*']:
        start_index = accept.find(t)
        if start_index < 0:
            continue
        end_index = (accept + ',').find(',', start_index)
        content_type_q = accept[start_index:end_index].split(';')
        if len(content_type_q) > 1:
            priority = max(priority, float(content_type_q[1].split('=')[1]))
        else:
            priority = 1.
    return priority

def wrap(text):
    return b"""\
<!DOCTYPE html>
<html>
<head>
<title>Our Gateway</title>
<body>%s</body>
</html>""" % text

def error_page(http, code, title, description):
    http(code, [('Content-Type', 'text/html')])
    ep = """\
<center>
<h1>%s %s</h1>
<hr>
%s
<br><br>
- Our Gateway -
</center>""" % (code, title, description)
    return wrap(ep.encode())
