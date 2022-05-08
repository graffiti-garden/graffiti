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
expiration_time = float(getenv('AUTH_CODE_EXP_TIME')) # minutes
secret = getenv('AUTH_SECRET')
heartbeat_interval = float(getenv('AUTH_SOCKET_HEARTBEAT'))
signature_cache_size = int(getenv('AUTH_SIGNATURE_CACHE_SIZE'))
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
        message = MIMEText(f"{login_link}")
        message["Subject"] = Header("login link")
        message["From"] = f"graffiti <noreply@{origin}>"
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

# Below: sockets for magic linking 

hash_to_signature = {}

@router.websocket("/auth_socket")
async def auth_socket(ws: WebSocket, signature_hash: str):
    await ws.accept()

    # Keep alive
    while True:
        try:
            if signature_hash in hash_to_signature:
                await ws.send_json({
                    'type': 'Signature',
                    'signature': hash_to_signature[signature_hash]
                })
                del hash_to_signature[signature_hash]
                await ws.close()
                break
            else:
                await ws.send_json({'type': 'Ping'})
        except:
            break
        await asyncio.sleep(heartbeat_interval)

@router.get("/auth_socket_send", response_class=HTMLResponse)
async def auth_socket_send(signature: str):
    # Take the hash of the signature, to make sure it's real
    signature_hash = sha256(signature.encode()).hexdigest()

    # Confirm the hash
    hash_to_signature[signature_hash] = signature

    # If we have too many hashes, delete an old one
    # (this could be a bug if too many people try to log in at exactly the same time)
    if len(hash_to_signature) > signature_cache_size:
        hash_to_signature.pop(next(iter(hash_to_signature)))

    return "<script>window.close()</script>"
