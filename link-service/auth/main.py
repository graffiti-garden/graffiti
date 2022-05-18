#!/usr/bin/env python3

import time
import jwt
import asyncio
from hashlib import sha256
from os import getenv
from aiosmtplib import send as sendEmail
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formatdate, make_msgid
from uuid import uuid5, NAMESPACE_DNS
from urllib.parse import urlencode

import uvicorn
from fastapi import FastAPI, Form, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

debug = (getenv('DEBUG') == 'true')
expiration_time = 60*float(getenv('AUTH_CODE_EXP_TIME')) # min -> sec
secret = getenv('AUTH_SECRET')
secret_namespace = uuid5(NAMESPACE_DNS, secret)

app = FastAPI()

# Allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# A static style for authentication
app.mount("/style", StaticFiles(directory="auth/style"), name="style")

templates = Jinja2Templates(directory="auth/templates")

# For magic linking
magic_events = {} # hash -> (event, signature)

@app.get("/auth", response_class=HTMLResponse)
async def auth(
        client_id: str,
        redirect_uri: str,
        request: Request,
        email: str|None = "",
        state: str|None = ""):

    # Ask the user to log in
    return templates.TemplateResponse("login.html", {
        'request': request,
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'state': state,
        'email': email
    })

@app.get("/email", response_class=HTMLResponse)
async def email(
        client_id: str,
        redirect_uri: str,
        state: str,
        email: str,
        origin: str,
        request: Request):

    # Make email lowercase so one email
    # doesn't become multiple accounts
    email = email.lower()

    # Generate an authorization code
    code = jwt.encode({
        "type": "code",
        "client_id": client_id,
        "owner_id": str(uuid5(secret_namespace, email)),
        "time": time.time()
    }, secret, algorithm="HS256")

    # Take the last part of the code (the signature)
    header, payload, signature = code.split('.')

    login_link = f"{origin}/auth_socket_send?signature={signature}"

    # Send the user the smaller part for verification
    if debug:
        # In debug mode, print the login link
        print(f"login link: {login_link}")
    else:
        # Otherwise, construct an email
        message = MIMEText(f"{login_link}")
        message["Subject"] = Header("login link")
        message["From"] = f"graffiti <noreply@{origin.split('://')[1]}>"
        message["To"] = email
        message["Message-ID"] = make_msgid()
        message["Date"] = formatdate()

        # Send!
        try:
            await sendEmail(message, hostname="mailserver", port=25)
        except:
            # Redirect back home with an error
            home = "auth?" + urlencode({
                'client_id': client_id,
                'redirect_uri': redirect_uri,
                'state': state,
                'email': email
            })
            return f"<script>window.location.replace('{home}')</script>"

    # Create an event
    now = time.time()
    signature_hash = sha256(signature.encode()).hexdigest()
    magic_events[signature_hash] = (asyncio.Event(), signature, now)

    # Remove expired events
    for sh in magic_events:
        if magic_events[sh][2] + expiration_time < now:
            del magic_events[sh]

    # Return a form that will combine the code pieces
    # and then send it to the redirect_uri
    return templates.TemplateResponse("code.html", {
        'request': request,
        'email': email,
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'state': state,
        'code_body': header + '.' + payload,
        'signature_hash': signature_hash
    })

@app.post("/token")
def token(
        client_id: str = Form(...),
        code:      str = Form(...),
        client_secret: str = Form(...)):

    # Assert that the code is valid
    try:
        code = jwt.decode(code, secret, algorithms=["HS256"])
    except:
        raise HTTPException(status_code=400, detail="Malformed code.")
    if not code["type"] == "code":
        raise HTTPException(status_code=400, detail="Malformed code.")

    # Assert that the code has not expired
    if code["time"] + expiration_time < time.time():
        raise HTTPException(status_code=400, detail="Code has expired.")

    # Assert that the client_id is paired to the token
    if client_id != code["client_id"]:
        raise HTTPException(status_code=400, detail="Client ID does not match code.")

    # Assert that the secret is valid
    if sha256(client_secret.encode()).hexdigest() != client_id:
        raise HTTPException(status_code=400, detail="Invalid client secret.")
    
    # If authorized, create a token
    token = jwt.encode({
        "type": "token",
        "owner_id": code["owner_id"]
        }, secret, algorithm="HS256")

    return {"access_token": token, "owner_id": code["owner_id"], "token_type": "bearer"}

@app.websocket("/auth_socket")
async def auth_socket(ws: WebSocket, signature_hash: str):
    await ws.accept()

    if signature_hash not in magic_events:
        await ws.send_json({
            'type': 'error',
            'detail': 'hash does not exist.'
        })
        await ws.close()
        return

    # Wait for the event
    event, signature, _ = magic_events[signature_hash]
    await event.wait()

    # Send the signature and cleanup
    await ws.send_json({
        'type': 'signature',
        'signature': signature
    })
    await ws.close()

@app.get("/auth_socket_send", response_class=HTMLResponse)
async def auth_socket_send(signature: str):
    # Take the hash of the signature, to make sure it's real
    signature_hash = sha256(signature.encode()).hexdigest()

    if signature_hash not in magic_events:
        raise HTTPException(status_code=400, detail="invalid signature hash.")

    # Set the event
    event, signature, _ = magic_events[signature_hash]
    event.set()

    # Cleanup and close
    del magic_events[signature_hash]
    return "<script>window.close()</script>"

if __name__ == "__main__":
    if getenv('DEBUG') == 'true':
        args = {'port': 5000, 'reload': True}
    else:
        args = {'port': 5000, 'proxy_headers': True}
    uvicorn.run('auth.main:app', host='0.0.0.0', **args)
