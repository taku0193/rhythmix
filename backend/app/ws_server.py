from fastapi import FastAPI, WebSocket, WebSocketDisconnect

clients: list[WebSocket] = []

def setup_ws(app: FastAPI):
    @app.websocket("/ws")
    async def websocket_endpoint(ws: WebSocket):
        await ws.accept()
        clients.append(ws)
        try:
            while True:
                data = await ws.receive_text()
                # 必要なら他クライアントへブロードキャスト
                for client in clients:
                    if client is not ws:
                        await client.send_text(data)
        except WebSocketDisconnect:
            clients.remove(ws)
