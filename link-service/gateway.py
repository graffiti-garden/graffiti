#!/usr/bin/env python3

def application(env, http):
    headers = [('Content-Type', 'text/html')]
    http('200 OK', headers)
    html = """
<!DOCTYPE html>
<html>
<head>
</head>
<body>
Hello World!
</body>
"""

    return [html.encode()]
