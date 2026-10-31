/* ==========================================================
   Panel de administración de servidores dinámicos
   Consume la API del balanceador con fetch():
     GET /servidores   -> lista de servidores
     GET /solicitar    -> envía una solicitud al balanceador
     GET /estadisticas -> solicitudes procesadas
   ========================================================== */

// ⚠️ Cambia esta URL por la del balanceador que desarrollaron en clase
const API_URL = "http://127.0.0.1:8000";

// Tiempo máximo de espera por petición (ms)
const TIMEOUT_MS = 5000;

/* ---------- Referencias al DOM ---------- */
const el = {
  mensajes: document.getElementById("mensajes"),
  totalSolicitudes: document.getElementById("total-solicitudes"),
  totalServidores: document.getElementById("total-servidores"),
  totalActivos: document.getElementById("total-activos"),
  tablaServidores: document.getElementById("tabla-servidores"),
  btnActualizar: document.getElementById("btn-actualizar"),
  btnSolicitar: document.getElementById("btn-solicitar"),
  resultado: document.getElementById("resultado-solicitud"),
  estadisticas: document.getElementById("estadisticas"),
};

/* ==========================================================
   Utilidades
   ========================================================== */

/** Muestra un mensaje en el área "Mensajes del sistema". tipo: info | exito | error | aviso */
function mostrarMensaje(texto, tipo = "info") {
  const div = document.createElement("div");
  div.className = `mensaje ${tipo}`;
  const hora = document.createElement("span");
  hora.className = "hora";
  hora.textContent = new Date().toLocaleTimeString("es-CO");
  div.append(hora, texto);
  el.mensajes.prepend(div);
  while (el.mensajes.children.length > 30) el.mensajes.lastChild.remove();
}

/** Error propio para distinguir causas (red, http, sin servidores) */
class ErrorApi extends Error {
  constructor(mensaje, tipo, estado) {
    super(mensaje);
    this.tipo = tipo;       // "red" | "http" | "sin-servidores"
    this.estado = estado;   // código HTTP si aplica
  }
}

/** fetch con timeout; devuelve el JSON (o texto) de la respuesta */
async function pedir(ruta) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  let respuesta;
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, { signal: controlador.signal });
  } catch (e) {
    throw new ErrorApi("La API no responde", "red");
  } finally {
    clearTimeout(temporizador);
  }

  // Intentar leer el cuerpo como JSON; si no, como texto
  const texto = await respuesta.text();
  let datos;
  try { datos = JSON.parse(texto); } catch { datos = texto; }

  if (!respuesta.ok) {
    const detalle = typeof datos === "object" && datos !== null
      ? (datos.detail || datos.error || datos.mensaje || datos.message || JSON.stringify(datos))
      : String(datos);
    const sinServidores = respuesta.status === 503 || /no hay servidores|sin servidores|no servers|no available/i.test(detalle);
    throw new ErrorApi(
      detalle || `Error HTTP ${respuesta.status}`,
      sinServidores ? "sin-servidores" : "http",
      respuesta.status
    );
  }
  return datos;
}

/** Busca el primer valor definido entre varias posibles claves */
function tomar(obj, claves, defecto = undefined) {
  for (const c of claves) {
    if (obj && obj[c] !== undefined && obj[c] !== null) return obj[c];
  }
  return defecto;
}

/* ==========================================================
   1. Consultar servidores  (GET /servidores)
   ========================================================== */

/** Convierte lo que devuelva la API en una lista uniforme [{nombre, puerto, activo}] */
function normalizarServidores(datos) {
  let lista = datos;
  if (!Array.isArray(lista) && lista && typeof lista === "object") {
    lista = tomar(lista, ["servidores", "servers", "data"], null);
    // Si viene como objeto { "servidor1": {...} } lo convertimos en lista
    if (!Array.isArray(lista) && lista && typeof lista === "object") {
      lista = Object.entries(lista).map(([nombre, v]) =>
        typeof v === "object" ? { nombre, ...v } : { nombre, puerto: v }
      );
    }
  }
  if (!Array.isArray(lista)) return [];

  return lista.map((s, i) => {
    const estadoCrudo = tomar(s, ["estado", "status", "activo", "active", "disponible", "online"], "desconocido");
    return {
      nombre: tomar(s, ["nombre", "name", "servidor", "id"], `Servidor ${i + 1}`),
      puerto: tomar(s, ["puerto", "port"], "–"),
      activo: esActivo(estadoCrudo),
      estadoTexto: typeof estadoCrudo === "boolean" ? (estadoCrudo ? "Activo" : "Inactivo") : String(estadoCrudo),
    };
  });
}

function esActivo(valor) {
  if (typeof valor === "boolean") return valor;
  const t = String(valor).toLowerCase().trim();
  return ["activo", "activa", "active", "up", "online", "true", "1", "ok", "disponible"].includes(t);
}

function pintarServidores(servidores) {
  el.tablaServidores.innerHTML = "";

  if (servidores.length === 0) {
    el.tablaServidores.innerHTML = `<tr><td colspan="3" class="vacio">No hay servidores registrados.</td></tr>`;
  }

  servidores.forEach((s) => {
    const fila = document.createElement("tr");
    if (!s.activo) fila.className = "fila-inactiva";

    const tdNombre = document.createElement("td");
    tdNombre.textContent = s.nombre;
    const tdPuerto = document.createElement("td");
    tdPuerto.textContent = s.puerto;
    const tdEstado = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `estado ${s.activo ? "activo" : "inactivo"}`;
    badge.textContent = s.activo ? "Activo" : "Inactivo";
    tdEstado.appendChild(badge);

    fila.append(tdNombre, tdPuerto, tdEstado);
    el.tablaServidores.appendChild(fila);
  });

  el.totalServidores.textContent = servidores.length;
  el.totalActivos.textContent = servidores.filter((s) => s.activo).length;
}

async function cargarServidores() {
  try {
    const datos = await pedir("/servidores");
    const servidores = normalizarServidores(datos);
    pintarServidores(servidores);

    const activos = servidores.filter((s) => s.activo).length;
    if (servidores.length === 0) {
      mostrarMensaje("No hay servidores registrados en la API.", "aviso");
    } else if (activos === 0) {
      mostrarMensaje("No hay servidores disponibles: todos están inactivos.", "error");
    } else {
      mostrarMensaje(`Servidores actualizados: ${activos} activo(s) de ${servidores.length}.`, "exito");
    }
    return servidores;
  } catch (e) {
    el.tablaServidores.innerHTML = `<tr><td colspan="3" class="vacio">No se pudo obtener la lista de servidores.</td></tr>`;
    el.totalServidores.textContent = "–";
    el.totalActivos.textContent = "–";
    if (e.tipo === "red") {
      mostrarMensaje("La API no responde. Verifica que el balanceador esté en ejecución y que la URL sea correcta.", "error");
    } else {
      mostrarMensaje(`Error al consultar los servidores: ${e.message}`, "error");
    }
    return [];
  }
}

/* ==========================================================
   2. Enviar solicitud  (GET /solicitar)
   ========================================================== */

function pintarResultadoSolicitud(datos) {
  el.resultado.className = "resultado ok";
  el.resultado.innerHTML = "";

  const dl = document.createElement("dl");
  const agregar = (titulo, valor) => {
    const dt = document.createElement("dt");
    dt.textContent = titulo;
    const dd = document.createElement("dd");
    dd.textContent = valor;
    dl.append(dt, dd);
  };

  if (datos && typeof datos === "object") {
    const servidor = tomar(datos, ["servidor", "server", "atendido_por", "nombre"], null);
    const puerto = tomar(datos, ["puerto", "port"], null);
    const respuesta = tomar(datos, ["respuesta", "resultado", "mensaje", "message", "response"], null);

    agregar("Servidor que atendió", servidor !== null ? servidor : "(la API no indicó el servidor)");
    if (puerto !== null) agregar("Puerto", puerto);
    if (respuesta !== null) {
      agregar("Resultado", typeof respuesta === "object" ? JSON.stringify(respuesta) : respuesta);
    }
    el.resultado.appendChild(dl);

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(datos, null, 2);
    el.resultado.appendChild(pre);
    return servidor;
  }

  // Respuesta de texto plano
  agregar("Resultado", String(datos));
  el.resultado.appendChild(dl);
  return null;
}

function pintarErrorSolicitud(texto) {
  el.resultado.className = "resultado error";
  el.resultado.innerHTML = "";
  const p = document.createElement("p");
  p.textContent = texto;
  p.style.margin = "0";
  el.resultado.appendChild(p);
}

async function enviarSolicitud() {
  el.btnSolicitar.disabled = true;
  el.btnSolicitar.textContent = "Enviando…";

  try {
    const datos = await pedir("/solicitar");
    const servidor = pintarResultadoSolicitud(datos);
    mostrarMensaje(
      servidor ? `Solicitud atendida por: ${servidor}.` : "Solicitud procesada correctamente.",
      "exito"
    );
  } catch (e) {
    let texto;
    if (e.tipo === "red") {
      texto = "La solicitud no pudo procesarse: la API no responde.";
    } else if (e.tipo === "sin-servidores") {
      texto = "La solicitud no pudo procesarse: no hay servidores disponibles.";
    } else {
      texto = `La solicitud no pudo procesarse: ${e.message}`;
    }
    pintarErrorSolicitud(texto);
    mostrarMensaje(texto, "error");
  } finally {
    el.btnSolicitar.disabled = false;
    el.btnSolicitar.textContent = "Enviar solicitud";
    // Actualizar estadísticas (y estado de servidores) después de cada solicitud
    await cargarEstadisticas(true);
    await cargarServidores();
  }
}

/* ==========================================================
   3. Estadísticas  (GET /estadisticas)
   ========================================================== */

/** Devuelve { total, porServidor: [{nombre, cantidad}] } sin importar el formato exacto */
function normalizarEstadisticas(datos) {
  const resultado = { total: null, porServidor: [] };
  if (datos === null || typeof datos !== "object") return resultado;

  // Caso: la API devuelve directamente una lista
  if (Array.isArray(datos)) {
    resultado.porServidor = datos.map((d, i) => ({
      nombre: tomar(d, ["nombre", "servidor", "name", "server"], `Servidor ${i + 1}`),
      cantidad: Number(tomar(d, ["solicitudes", "cantidad", "total", "requests", "count"], 0)),
    }));
    resultado.total = resultado.porServidor.reduce((a, s) => a + s.cantidad, 0);
    return resultado;
  }

  const total = tomar(datos, ["Total_solicitudes", "total", "total_solicitudes", "solicitudes_totales", "total_requests", "totalSolicitudes"], null);
  if (total !== null && !isNaN(Number(total))) resultado.total = Number(total);

  // Buscar el contenedor con el detalle por servidor
  let detalle = tomar(datos, ["por_servidor", "servidores", "solicitudes_por_servidor", "detalle", "servers", "estadisticas"], null);

  // Si no hay contenedor, tomar las claves numéricas del propio objeto (excepto el total)
  if (detalle === null) {
    detalle = {};
    for (const [k, v] of Object.entries(datos)) {
      if (typeof v === "number" && !/total/i.test(k)) detalle[k] = v;
    }
  }

  if (Array.isArray(detalle)) {
    resultado.porServidor = detalle.map((d, i) => ({
      nombre: tomar(d, ["nombre", "servidor", "name", "server"], `Servidor ${i + 1}`),
      cantidad: Number(tomar(d, ["solicitudes", "cantidad", "total", "requests", "count", "atendidas"], 0)),
    }));
  } else if (typeof detalle === "object") {
    resultado.porServidor = Object.entries(detalle).map(([nombre, v]) => ({
      nombre,
      cantidad: Number(typeof v === "object" ? tomar(v, ["solicitudes", "cantidad", "total", "requests", "count", "atendidas"], 0) : v),
    }));
  }

  if (resultado.total === null) {
    resultado.total = resultado.porServidor.reduce((a, s) => a + s.cantidad, 0);
  }
  return resultado;
}

function pintarEstadisticas({ total, porServidor }) {
  el.totalSolicitudes.textContent = total;
  el.estadisticas.innerHTML = "";

  if (porServidor.length === 0) {
    el.estadisticas.innerHTML = `<p class="vacio">La API no reportó solicitudes por servidor.</p>`;
    return;
  }

  const maximo = Math.max(total, ...porServidor.map((s) => s.cantidad), 1);

  porServidor.forEach((s) => {
    const item = document.createElement("div");
    item.className = "barra-item";

    const info = document.createElement("div");
    info.className = "barra-info";
    const nombre = document.createElement("span");
    nombre.textContent = s.nombre;
    const cantidad = document.createElement("span");
    const porcentaje = total > 0 ? Math.round((s.cantidad / total) * 100) : 0;
    cantidad.textContent = `${s.cantidad} solicitudes (${porcentaje}%)`;
    info.append(nombre, cantidad);

    const fondo = document.createElement("div");
    fondo.className = "barra-fondo";
    const relleno = document.createElement("div");
    relleno.className = "barra-relleno";
    relleno.style.width = `${(s.cantidad / maximo) * 100}%`;
    fondo.appendChild(relleno);

    item.append(info, fondo);
    el.estadisticas.appendChild(item);
  });
}

async function cargarEstadisticas(silencioso = false) {
  try {
    const datos = await pedir("/estadisticas");
    pintarEstadisticas(normalizarEstadisticas(datos));
    if (!silencioso) mostrarMensaje("Estadísticas actualizadas.", "exito");
  } catch (e) {
    el.estadisticas.innerHTML = `<p class="vacio">No se pudieron consultar las estadísticas.</p>`;
    el.totalSolicitudes.textContent = "–";
    mostrarMensaje(
      e.tipo === "red"
        ? "No se pueden consultar las estadísticas: la API no responde."
        : `No se pueden consultar las estadísticas: ${e.message}`,
      "error"
    );
  }
}

/* ==========================================================
   Inicio y eventos
   ========================================================== */

el.btnActualizar.addEventListener("click", async () => {
  el.btnActualizar.disabled = true;
  await cargarServidores();
  await cargarEstadisticas(true);
  el.btnActualizar.disabled = false;
});

el.btnSolicitar.addEventListener("click", enviarSolicitud);

(async function iniciar() {
  await cargarServidores();
  await cargarEstadisticas(true);
})();