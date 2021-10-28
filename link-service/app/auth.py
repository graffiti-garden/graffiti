import time
import jwt
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
        authorizationUrl = "auth",
        tokenUrl = "token")

@router.get("/auth", response_class=HTMLResponse)
async def auth(
        client_id: str,
        redirect_uri: str,
        state: str,
        token: Optional[str] = Cookie(None)):

    # If there is no token, ask user to log in.
    if not token:
        return login(client_id, redirect_uri, state)

    if token:
        # If the token is bad, delete it and ask the user to log in.
        try:
            user = token_to_user(token)
        except HTTPException:
            reponse.delete_cookie("token")
            return login(client_id, redirect_uri, state)

        # Otherwise, generate a new authorization code and let the
        # user choose if they want to send it or not.
        code = auth_code(client_id, user)
        return template(
                prompt=f"Would you like to authorize with the account connected to {user}?",
                options={
                    "Choose Another Account": "document.cookie = 'token='; window.location.reload()",
                    "Authorize": f"window.location.replace('{redirect_uri}?state={state}&code={code}')"
                })

def login(client_id: str, redirect_uri: str, state: str):
    return template(
            prompt="To authorize access, you must log in.<br>Enter your email to be sent a login code:",
            input_id="email",
            options={
                "Email Login Code": f"""
                var email = document.getElementById('email').value;
                window.location.replace(`login_email?client_id={client_id}&redirect_uri={redirect_uri}&state={state}&email=${{email}}`);
                """
            })

def auth_code(client_id: str, email: str):
    # TODO:
    # - Encrypt the email
    # - Add scope

    return jwt.encode({
        "type": "code",
        "client_id": client_id,
        "email": email,
        "time": time.time()
        }, secret, algorithm="HS256")

@router.get("/login_email", response_class=HTMLResponse)
async def login_email(client_id: str, redirect_uri: str, state: str, email: str, request: Request):
    # TODO: Make sure this page is being loaded from another theater page
    # request.origin
    # All that does is protect the email.. right?
    # They could also fake scopes. That would be bad.

    code = auth_code(client_id, email)

    # Email part of the signature for verification
    code_end = code[-code_size:]
    message = MIMEText(code_end)
    message["Subject"] = Header("Login Code")
    message["From"] = mail_from
    message["To"] = email
    message["Message-ID"] = make_msgid()
    message["Date"] = formatdate()

    # Send!
    try:
        await sendEmail(message, hostname="mailserver", port=25)
    except:
        # TODO: redirect back to auth with invalid email
        # "email could not be sent, please enter a valid email"
        raise HTTPException(status_code=422, detail="Invalid email.")

    # Return a form that will combine the pieces and return the code
    code_start = code[:-code_size]
    return template(
            prompt="Enter your login code to log in and authorize",
            input_id="code_end",
            options={
                "Login and Authorize": f"""
                var code_end = document.getElementById('code_end').value;
                window.location.replace(`{redirect_uri}?state={state}&code={code_start}${{code_end}}`)
                """
            })

@router.get("/auth_redirect", response_class=HTMLResponse)
async def auth_redirect(state: str, code: str):
    return f"""
    <script>
        window.opener.postMessage("{code}", "{state}")
        window.close()
    </script>
    """

@router.post("/token")
def token(
        response: Response,
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
        "email": code["email"],
        }, secret, algorithm="HS256")

    # Store cookie for repeat logins
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

    return token["email"]

def template(prompt: str, options: dict, input_id: str = None):
    options["Cancel"] = "window.close()"

    buttonHTML = ""
    for key in options:
        buttonHTML += f'<input type="button" value="{key}" onclick="{options[key]}" />'

    inputHTML = ""
    if input_id:
        inputHTML = f'<br><input type="text" id="{input_id}">'

    return f"""\
<!DOCTYPE html>
<html>
<head>
    <title>Theater Authorization</title>
</head>
<body>
    {prompt}
    {inputHTML}
    <br>
    {buttonHTML}
</body>
</html>\
"""
