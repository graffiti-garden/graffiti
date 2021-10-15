import time
import string
import jwt
from hashlib import sha256
from os import getenv
from aiosmtplib import send as sendEmail
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formatdate, make_msgid
from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2AuthorizationCodeBearer

mail_from = getenv('MAIL_FROM')
# TODO: clean these up and hide secret
secret = "secret" 
code_size = 6
code_expiration_time = 5 # minutes

router = APIRouter()
oauth2_scheme = OAuth2AuthorizationCodeBearer(
        authorizationUrl = "email_code",
        tokenUrl = "token")

def generate_code(email: str, minute_offset: int = 0):

    # Each minute has a new code
    time_in_minutes = int(time.time()/60)
    time_in_minutes -= minute_offset

    # Compute a secret hash
    code_data = email + str(time_in_minutes) + secret
    code_hex = sha256(code_data.encode()).hexdigest()

    # Convert the low bits to alpha-numeric
    alphabet = string.digits + string.ascii_uppercase
    code = ""
    code_int = int(code_hex, 16)
    for _ in range(code_size):
        code_int, digit = divmod(code_int, len(alphabet))
        code += alphabet[digit]

    return code

@router.get("/email_code", response_class=HTMLResponse)
async def email_code(client_id: str, redirect_uri: str, state: str):

    # Make a client-specific and perishable code
    code = generate_code(client_id)

    # Put the code in an email
    message = MIMEText(code)
    message["Subject"] = Header("Login Code")
    message["From"] = mail_from
    message["To"] = client_id
    message["Message-ID"] = make_msgid()
    message["Date"] = formatdate()

    # Send!
    try:
        await sendEmail(message, hostname="mailserver", port=25)
    except:
        raise HTTPException(status_code=422, detail="Invalid email.")

    return f"""
    <form action={redirect_uri}>
        <input type="hidden" name="state" value="{state}">
        <label for="code">Enter the login code emailed to {client_id}:</label>
        <br>
        <input type="text" name="code" id="code">
        <br>
        <button>Submit</button>
    </form>
    """

@router.post("/token")
async def token(client_id: str = Form(...), code: str = Form(...)):

    # Iterate over possible codes generated in
    # the expiration window and look for a match
    time_in_minutes = int(time.time()/60)
    for i in range(0, code_expiration_time):
        possible_code = generate_code(client_id, i)
        if code == possible_code:
            break
    else:
        raise HTTPException(status_code=401, detail="Invalid code.")
    
    # If authorized, create a token
    token = jwt.encode({
        "email": client_id,
        }, secret, algorithm="HS256")

    # TODO: make this token expire and add a refresh token

    return {"access_token": token, "token_type": "bearer"}

async def token_to_user(token: str = Depends(oauth2_scheme)):

    try:
        data = jwt.decode(token, secret, algorithms=["HS256"])
    except:
        raise HTTPException(status_code=400, detail="Malformed token")

    return data["email"]

# TODO:

# In the javascript library you login via a prompt.
#
#
# Optional[This actions requires you to login to.]
#
# Enter your email to be sent a login code:
# [Box]
# 
# [Ok], [Cancel]
#
#
# Then another prompt:
#
#
# Enter your login code:
# [Box]
#
# [Ok], [Cancel]
