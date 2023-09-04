import { WebSocketServer } from "ws";

export function mockServer(onIntercept) {

  const mockPort = 12345
  const realURL = "ws://localhost:8000"
  const mockServer = new WebSocketServer({port: mockPort})

  mockServer.on('connection', fakeSocket=> {

    const realSocket = new WebSocket(realURL)

    let open = false
    const et = new EventTarget()
    realSocket.onopen = ()=> {
      open = true
      et.dispatchEvent(new Event("open"))
    }

    fakeSocket.onclose = ()=> {
      realSocket.close()
    }

    // Forward messages back and forth
    realSocket.onmessage = ({data: message})=> {
      fakeSocket.send(message)
    }
    fakeSocket.on('message', async message=> {
      // Wait for the real socket to open
      if (!open) {
        await new Promise(resolve=> 
          et.addEventListener(
            'open',
            ()=> resolve()
          )
        )
      }

      if (onIntercept(fakeSocket, `${message}`)) {
        realSocket.send(`${message}`)
      }
    })
  })

  return { server: mockServer, url: `ws://localhost:${mockPort}` }
}