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
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, Cookie
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2AuthorizationCodeBearer
from fastapi.templating import Jinja2Templates
from uuid import uuid5, NAMESPACE_DNS

debug = (getenv('DEBUG') == 'true')
mail_from = getenv('AUTH_MAIL_FROM')
expiration_time = float(getenv('AUTH_CODE_EXP_TIME')) # minutes
code_size = int(getenv('AUTH_CODE_SIZE'))
secret = getenv('AUTH_SECRET')
secret_namespace = uuid5(NAMESPACE_DNS, secret)

router = APIRouter()
oauth2_scheme = OAuth2AuthorizationCodeBearer(
        authorizationUrl = "auth",
        tokenUrl = "token")

templates = Jinja2Templates(directory="graffiti/templates")

@router.get("/auth", response_class=HTMLResponse)
async def auth(
        client_id: str,
        redirect_uri: str,
        request: Request,
        response: Response,
        state: Optional[str] = "",
        token: Optional[str] = Cookie(None)):

    # Determine which site is asking for access
    client = request.headers['referer']

    # Check if we are already logged in...
    if token:
        try:
            email = token_to_user(token)
        except HTTPException:
            response.delete_cookie("token")
            token = False

    # If there is no valid token, ask the user to log in
    if not token:
        return templates.TemplateResponse("login.html", {
            'request': request,
            'client': client,
            'client_id': client_id,
            'redirect_uri': redirect_uri,
            'state': state,
            'email': ''
        })

    # Otherwise, the user must be logged in.
    # Generate a new authorization code and let the user
    # choose if they want to send it or not.
    code = auth_code(client_id, email)
    return templates.TemplateResponse("auth.html", {
        'request': request,
        'email': email,
        'client': client,
        'redirect_uri': redirect_uri,
        'state': state,
        'code': code
    })

def auth_code(client_id: str, email: str, remember: bool = False):
    return jwt.encode({
        "type": "code",
        "client_id": client_id,
        "user": str(uuid5(secret_namespace, email)),
        "time": time.time(),
        "remember": remember
    }, secret, algorithm="HS256")

@router.get("/email", response_class=HTMLResponse)
async def email(
        client: str,
        client_id: str,
        redirect_uri: str,
        state: str,
        email: str,
        remember: bool,
        request: Request):

    # Generate an authorization code
    code = auth_code(client_id, email, remember)

    # Take the last part of the code (the signature)
    header, payload, signature = code.split('.')

    # Reencode into base 32 (only capitals and ints)
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
        "user": code["user"]
        }, secret, algorithm="HS256")

    # Store cookie for repeat logins
    if code["remember"]:
        response.set_cookie("token", token, samesite="strict")

    return {"access_token": token, "token_type": "bearer"}

def token_to_user(token: str = Depends(oauth2_scheme)):
    # Assert that the token is valid
    try:
        token = jwt.decode(token, secret, algorithms=["HS256"])
    except:
        raise HTTPException(status_code=400, detail="Malformed token")
    if not token["type"] == "token":
        raise HTTPException(status_code=400, detail="Wrong code type.")

    return token["user"]
