#!/usr/bin/env python3

import uvicorn
from os import getenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# Serve the API
routes = ['perform', 'attend', 'pod', 'auth']
for r in routes:
    module = __import__('theater.' + r, fromlist=['router'])
    app.include_router(module.router)

# Serve the static files
app.mount('/js', StaticFiles(directory='js'))
app.mount('/', StaticFiles(directory='www', html=True))

if __name__ == "__main__":
    if getenv('DEBUG') == 'true':
        args = {'port': 5000, 'reload': True}
    else:
        args = {'port': 80, 'proxy_headers': True}
    uvicorn.run('theater.main:app', host='0.0.0.0', **args)
