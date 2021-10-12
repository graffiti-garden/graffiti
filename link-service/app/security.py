from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

# TODO implement user account creation and OAuth token
# creation. Then make a map from allocated tokens -> users
# First verify that the token is allocated (if not, 400),
# otherwise return the associated user.

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@router.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    return {"access_token": form_data.username, "token_type": "bearer"}

async def token_to_user(token: str = Depends(oauth2_scheme)):
    return token
