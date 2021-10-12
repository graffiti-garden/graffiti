#!/usr/bin/env python3

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .config import PACKAGE

app = FastAPI()

routes = ['login', 'pod', 'perform', 'attend']
for r in routes:
    module = __import__(PACKAGE + '.' + r, fromlist=['router'])
    app.include_router(module.router)

app.mount('/', StaticFiles(directory='www', html=True))

if __name__ == "__main__":
    uvicorn.run(PACKAGE + '.main:app', host='0.0.0.0', port=80, reload=True)
