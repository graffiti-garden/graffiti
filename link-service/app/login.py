import aiosmtplib
from email.message import EmailMessage
from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from .config import MAIL_FROM, MAIL_HOST, MAIL_PORT

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@router.post("/login")
async def login(email: str):
    message = EmailMessage()
    message["From"] = MAIL_FROM
    message["To"] = email
    message["Subject"] = "Sign-In Link"
    message.set_content("Here is your magic link :^)")

    await aiosmtplib.send(
            message,
            hostname=MAIL_HOST,
            port=MAIL_PORT
            )

    return "Success"

@router.post("/token")
async def token(form_data: OAuth2PasswordRequestForm = Depends()):
    return {"access_token": form_data.username, "token_type": "bearer"}

async def token_to_user(token: str = Depends(oauth2_scheme)):
    return token
