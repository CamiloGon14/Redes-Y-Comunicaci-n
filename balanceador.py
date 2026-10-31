from fastapi import FastAPI, HTTPException
import httpx
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="API de la red de servidores",
    description="Sistema de distribución de solicitudes"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

servidores = [
    {
        "nombre": "Servidor 1",
        "url": "http://127.0.0.1:8001",
        "puerto": 8001
    },
    {
        "nombre": "Servidor 2",
        "url": "http://127.0.0.1:8002",
        "puerto": 8002
    },
    {
        "nombre": "Servidor 3",
        "url": "http://127.0.0.1:8003",
        "puerto": 8003
    }
]

siguiente = 0
historial = []

@app.get("/")
def inicio():   
    return {
        "Sistema": "Red de servidores dinamica ",
        "servidores_configurados": len(servidores),
        "solicitudes_enviadas": len(historial),
        "mensaje":"La API esta funcionando correctamente"
    }

@app.get("/servidores")
async def consultar_servidores():
    resultado = []
    async with httpx.AsyncClient(timeout=2.0) as Cliente:
        for servidor in servidores:
            estado = "inactivo"
            try:
                respuesta = await Cliente.get(
                    servidor["url"]+"/health"
                )
                if respuesta.status_code == 200:
                    estado = "activo"
            except httpx.RequestError:
                estado = "inactivo"
            resultado.append({
                "nombre": servidor["nombre"],
                "puerto": servidor["puerto"],
                "estado": estado
            })
    return {
        "Total_servidores": len(servidores),
        "servidores": resultado
    }

@app.get("/solicitar")
async def solicitar():
    global siguiente
    async with httpx.AsyncClient(timeout=2.0) as Cliente:
        cantidad = len(servidores)
        for _ in range(cantidad):
            servidor = servidores[siguiente % cantidad]
            siguiente= (siguiente + 1) % cantidad

            try:
                salud= await Cliente.get(
                    servidor["url"]+"/health"
                )
                if salud.status_code != 200:
                    continue
                respuesta = await Cliente.get(
                    servidor["url"]+"/procesar"
                )
                if respuesta.status_code == 200:
                    datos = respuesta.json()
                    historial.append(datos)
                    return datos
            except httpx.RequestError:
                continue    
    raise HTTPException(
        status_code=503, 
        detail="No hay servidores disponibles"
    )
@app.get("/estadisticas")
def estadisticas():
    resumen = {}

    for solicitud in historial:
        nombre= solicitud["servidor"]
        resumen[nombre] = resumen.get(nombre, 0) + 1       
    return {
        "Total_solicitudes": len(historial),
        "solicitudes_por_servidor": resumen
    }