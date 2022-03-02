import jwt
from os import getenv
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2AuthorizationCodeBearer

secret = getenv('AUTH_SECRET')

oauth2_scheme = OAuth2AuthorizationCodeBearer(
        authorizationUrl = "auth",
        tokenUrl = "token")

def token_to_signature(token: str = Depends(oauth2_scheme)):
    # Assert that the token is valid
    try:
        token = jwt.decode(token, secret, algorithms=["HS256"])
    except:
        raise HTTPException(status_code=400, detail="Malformed token")
    if not token["type"] == "token":
        raise HTTPException(status_code=400, detail="Wrong code type.")

    return token["signature"]
