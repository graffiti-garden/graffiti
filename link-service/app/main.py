#!/usr/bin/env python3

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

package = 'theater'

app = FastAPI()

routes = ['login', 'pod', 'perform', 'attend']
for r in routes:
    module = __import__(package + '.' + r, fromlist=['router'])
    app.include_router(module.router)

app.mount('/', StaticFiles(directory='www', html=True))

if __name__ == "__main__":
    uvicorn.run(package + '.main:app', host='0.0.0.0', port=80, reload=True)
