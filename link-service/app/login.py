from os import getenv
from aiosmtplib import send as sendEmail
from email.message import EmailMessage
from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@router.post("/login")
async def login(email: str):
    message = EmailMessage()
    message["From"] = getenv('MAIL_FROM')
    message["To"] = email
    message["Subject"] = "Sign-In Link"
    message.set_content("Here is your magic link :^)")

    await sendEmail(
            message,
            hostname="mailserver",
            port=25
            )

    return "Success"

@router.post("/token")
async def token(form_data: OAuth2PasswordRequestForm = Depends()):
    return {"access_token": form_data.username, "token_type": "bearer"}

async def token_to_user(token: str = Depends(oauth2_scheme)):
    return token
