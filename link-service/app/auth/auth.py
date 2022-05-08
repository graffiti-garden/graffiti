import time
import jwt
import base64
import asyncio
from hashlib import sha256
from os import getenv
from aiosmtplib import send as sendEmail
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formatdate, make_msgid
from typing import Optional
from fastapi import APIRouter, Form, HTTPException, Request, WebSocket
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from uuid import uuid5, NAMESPACE_DNS

debug = (getenv('DEBUG') == 'true')
mail_from = getenv('AUTH_CODE_MAIL_FROM')
expiration_time = float(getenv('AUTH_CODE_EXP_TIME')) # minutes
code_size = int(getenv('AUTH_CODE_SIZE'))
secret = getenv('AUTH_SECRET')
heartbeat_interval = float(getenv('SOCKET_HEARTBEAT'))
secret_namespace = uuid5(NAMESPACE_DNS, secret)

router = APIRouter()

templates = Jinja2Templates(directory="graffiti/auth/templates")

@router.get("/auth", response_class=HTMLResponse)
async def auth(
        client_id: str,
        redirect_uri: str,
        request: Request,
        state: Optional[str] = ""):

    # Determine which site is asking for access
    if 'referer' in request.headers:
        client = request.headers['referer']
    else:
        client = ''

    # Ask the user to log in
    return templates.TemplateResponse("login.html", {
        'request': request,
        'client': client,
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'state': state,
        'email': ''
    })

@router.get("/email", response_class=HTMLResponse)
async def email(
        client: str,
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
        message = MIMEText(f"""
welcome to graffiti!

click here to log in: {login_link}
""")
        message["Subject"] = Header("Login Code")
        message["From"] = mail_from
        message["To"] = email
        message["Message-ID"] = make_msgid()
        message["Date"] = formatdate()

        # Send!
        try:
            await sendEmail(message, hostname="mailserver", port=25)
        except:
            # Return to login with an error
            return templates.TemplateResponse("login.html", {
                'request': request,
                'client': client,
                'client_id': client_id,
                'redirect_uri': redirect_uri,
                'state': state,
                'email': email
            })

    # Return a form that will combine the code pieces
    # and then send it to the redirect_uri
    return templates.TemplateResponse("code.html", {
        'request': request,
        'email': email,
        'redirect_uri': redirect_uri,
        'state': state,
        'code_body': header + '.' + payload,
        'signature_hash': sha256(signature.encode()).hexdigest()
    })

@router.post("/token")
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
    if code["time"] + expiration_time*60 < time.time():
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

# Use sockets for magic linking

sockets = {}

@router.websocket("/auth_socket")
async def auth_socket(ws: WebSocket, signature_hash: str):
    await ws.accept()
    sockets[signature_hash] = ws

    # Keep alive
    while True:
        try:
            await ws.send_json({'type': 'Ping'})
        except:
            break
        await asyncio.sleep(heartbeat_interval)

    del sockets[signature_hash]

@router.get("/auth_socket_send", response_class=HTMLResponse)
async def auth_socket_send(signature: str):
    # Take the hash of the signature
    signature_hash = sha256(signature.encode()).hexdigest()

    if signature_hash in sockets:
        ws = sockets[signature_hash]
        try:
            await ws.send_json({
                'type': 'Signature',
                'signature': signature
            })
            await ws.close()
        except:
            pass
    return "<script>window.close()</script>"
