#!/usr/bin/env python3

import uvicorn
from os import getenv
from fastapi import FastAPI, WebSocket, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import PlainTextResponse

from .db import db_intialize
from . import rest

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield await db_intialize()

app = FastAPI(
    lifespan=lifespan,
)

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return PlainTextResponse(str(exc.detail), status_code=exc.status_code)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return PlainTextResponse(str(exc), status_code=422)

# Allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# Add the router
app.include_router(rest.router)

@app.get("/")
async def info():
    return {
        "name": "Graffiti Link Server",
        "description": "An end-to-end encrypted link server",
        "website": "https://github.com/graffiti-garden/link-server/"
    }

if __name__ == "__main__":
    args = {}
    if getenv('DEBUG') == 'true':
        args['reload'] = True
    uvicorn.run('app.main:app', host='0.0.0.0', **args)