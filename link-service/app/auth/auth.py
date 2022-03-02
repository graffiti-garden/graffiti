import time
import jwt
import base64
from hashlib import sha256
from os import getenv
from aiosmtplib import send as sendEmail
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formatdate, make_msgid
from typing import Optional
from fastapi import APIRouter, Form, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from uuid import uuid5, NAMESPACE_DNS

debug = (getenv('DEBUG') == 'true')
mail_from = getenv('AUTH_CODE_MAIL_FROM')
expiration_time = float(getenv('AUTH_CODE_EXP_TIME')) # minutes
code_size = int(getenv('AUTH_CODE_SIZE'))
secret = getenv('AUTH_SECRET')
secret_namespace = uuid5(NAMESPACE_DNS, secret)

router = APIRouter()

templates = Jinja2Templates(directory="graffiti/auth/templates")

@router.get("/auth", response_class=HTMLResponse)
async def auth(
        client_id: str,
        redirect_uri: str,
        request: Request,
        response: Response,
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
        request: Request):

    # Generate an authorization code
    code = jwt.encode({
        "type": "code",
        "client_id": client_id,
        "signature": str(uuid5(secret_namespace, email)),
        "time": time.time()
    }, secret, algorithm="HS256")

    # Take the last part of the code (the signature)
    header, payload, signature = code.split('.')

    # Re-encode into base 32 (only capitals and ints)
    while len(signature) % 4 != 0:
        signature += "="
    signature_bytes = base64.urlsafe_b64decode(signature)
    signature_32 = base64.b32encode(signature_bytes).decode()

    # The first part will be the secret sent in the email
    signature_32_secret = signature_32[:code_size]
    signature_32_known = signature_32[code_size:]

    # Send the user the smaller part for verification
    if debug:
        # In debug mode, just print the code
        print("Login code: ", signature_32_secret)
    else:
        # Otherwise, construct an email
        message = MIMEText(signature_32_secret)
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
        'client': client,
        'email': email,
        'redirect_uri': redirect_uri,
        'state': state,
        'code_body': header + '.' + payload,
        'signature_32_known': signature_32_known
    })

@router.post("/token")
def token(
        response: Response,
        client_id: str = Form(...),
        code:      str = Form(...),
        client_secret: str = Form(...)):

    # Assert that the code is valid
    try:
        # Re-encode in base 64
        code_body, signature_32 = code.split('~')
        signature_bytes = base64.b32decode(signature_32)
        signature = base64.urlsafe_b64encode(signature_bytes).decode()
        code = jwt.decode(code_body + '.' + signature, secret, algorithms=["HS256"])
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
        "signature": code["signature"]
        }, secret, algorithm="HS256")

    return {"access_token": token, "signature": code["signature"], "token_type": "bearer"}
