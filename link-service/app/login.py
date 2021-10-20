import time
import jwt
from hashlib import sha256
from os import getenv
from aiosmtplib import send as sendEmail
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formatdate, make_msgid
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2AuthorizationCodeBearer

# TODO:
# security:
# - Account for errors in reponse (i.e. if email is invalid)
# - encrypt email (https://stackoverflow.com/questions/27335726/how-do-i-encrypt-and-decrypt-a-string-in-python)
# - make a real secret (random every time)
# - CORS
# - Token expiration + refresh tokens
# UI:
# - code size to all capital letters
# - Magic link rather than code
# - Prettier interface
# Both kind of:
# - Scopes

mail_from = getenv('MAIL_FROM')
secret = "secret" 
expiration_time = 5 # minutes
code_size = 6

router = APIRouter()
oauth2_scheme = OAuth2AuthorizationCodeBearer(
        authorizationUrl = "login",
        tokenUrl = "token")

@router.get("/login", response_class=HTMLResponse)
async def login(
        client_id: str,
        redirect_uri: str,
        state: str):
    return f"""
    <script>
        const email = prompt("Enter your email to be sent a login code:")
        fetch(`https://theater.csail.mit.edu/email_code?client_id={client_id}&email=${{email}}`, {{method: 'Post'}})
        .then(res => res.json())
        .then(code_start => {{
            const code_end = prompt("Enter your login code:")
            window.location.replace(`{redirect_uri}?state={state}&code=${{code_start}}${{code_end}}`)
        }})
    </script>
    """

@router.get("/login_redirect", response_class=HTMLResponse)
async def login_redirect(state: str, code: str):
    return f"""
    <script>
        window.opener.postMessage("{code}", "{state}")
        window.close()
    </script>
    """

@router.post("/email_code")
async def email_magic(client_id: str, email: str, request: Request):
    # Make sure the request is being called from another theater page
    # request.origin

    # Encrypt the email

    # Construct a code
    code = jwt.encode({
        "type": "code",
        "client_id": client_id,
        "email": email,
        "time": time.time()
        }, secret, algorithm="HS256")

    # Email part of the signature for verification
    email_code = code[-code_size:]
    message = MIMEText(email_code)
    message["Subject"] = Header("Login Code")
    message["From"] = mail_from
    message["To"] = email
    message["Message-ID"] = make_msgid()
    message["Date"] = formatdate()

    # Send!
    try:
        await sendEmail(message, hostname="mailserver", port=25)
    except:
        raise HTTPException(status_code=422, detail="Invalid email.")

    # Return the rest of the code
    return code[:-code_size]

@router.post("/token")
async def token(
        client_id: str = Form(...),
        code:      str = Form(...),
        client_secret: str = Form(...)):

    # Assert that the code is valid
    try:
        code = jwt.decode(code, secret, algorithms=["HS256"])
    except:
        raise HTTPException(status_code=400, detail="Malformed code.")
    if not code["type"] == "code":
        raise HTTPException(status_code=400, detail="Wrong code type.")

    # Assert that the code has not expired
    if code["time"] + expiration_time*60 < time.time():
        raise HTTPException(status_code=400, detail="Expired code.")

    # Assert the client_id is paired to the token
    if client_id != code["client_id"]:
        raise HTTPException(status_code=400, detail="Client ID does not match code.")

    # Assert that the secret is valid
    if sha256(client_secret.encode()).hexdigest() != client_id:
        raise HTTPException(status_code=400, detail="Invalid client secret.")
    
    # If authorized, create a token
    token = jwt.encode({
        "type": "token",
        "email": client_id,
        }, secret, algorithm="HS256")

    return {"access_token": token, "token_type": "bearer"}

async def token_to_user(token: str = Depends(oauth2_scheme)):
    # Assert that the token is valid
    try:
        token = jwt.decode(token, secret, algorithms=["HS256"])
    except:
        raise HTTPException(status_code=400, detail="Malformed token")
    if not token["type"] == "token":
        raise HTTPException(status_code=400, detail="Wrong code type.")

    return token["email"]
