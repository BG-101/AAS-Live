# 🏆 AAS Live

**Software oficial de gestión de torneos de la Asociación Almeriense de Speedcubing.**

AAS Live es una aplicación web full-stack diseñada para gestionar competiciones de speedcubing en tiempo real: desde la inscripción de competidores hasta la generación de rankings, pasando por la gestión de rondas, clasificaciones por grupos de edad y sistemas de puntuación por ligas.

---

## Índice

- [Características](#características)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Instalación](#instalación)
- [Variables de entorno](#variables-de-entorno)
- [Inicialización del sistema](#inicialización-del-sistema)
- [Roles y permisos](#roles-y-permisos)
- [Funcionalidades principales](#funcionalidades-principales)
- [API](#api)
- [Seguridad](#seguridad)

---

## Características

- 🏆 **Gestión completa de competiciones** con soporte multidía, límite de aforo y agrupación en series/ligas.
- ⚡ **Resultados en tiempo real** mediante WebSockets: los tiempos introducidos por un delegado aparecen al instante en todas las pantallas conectadas.
- 🔢 **Lógica WCA oficial**: cálculo de Ao5, Mo3 y Bo3; desempates por single; soporte para DNF y DNS; cutoffs configurables por ronda.
- 🔄 **Sistema multironda**: avance por porcentaje o top fijo, calculado de forma independiente por grupo de edad si la competición lo requiere.
- 🏅 **Sistema SOR** (Sum of Ranks): ranking global por puntos con dos modalidades: SOR clásico y sistema Estilo F1.
- 👶 **Separación por grupos de edad**: Alevín (≤10), Infantil (11–15) y Absoluta (≥16), con clasificaciones independientes por categoría.
- 📺 **Modo Proyector**: pantalla de resultados en vivo con scroll automático y animación de podio para finales.
- 🔒 **Seguridad DevSecOps**: JWT en cookies `httpOnly`, RBAC, rate limiting, sanitización de queries MongoDB y registro de auditoría inmutable.

---

## Stack tecnológico

| Capa          | Tecnología                                                   |
| ------------- | ------------------------------------------------------------ |
| Frontend      | React 18, Vite, React Router DOM, Tailwind CSS               |
| Backend       | Node.js, Express                                             |
| Base de datos | MongoDB Atlas (Mongoose)                                     |
| Tiempo real   | Socket.IO                                                    |
| Autenticación | JWT + cookies `httpOnly`                                     |
| Seguridad     | Helmet, express-rate-limit, express-mongo-sanitize, bcryptjs |
| HTTP client   | Axios                                                        |

---

## Arquitectura

```
aas-live/
├── server/
│   ├── index.js                  # Punto de entrada: Express + Socket.IO + MongoDB
│   ├── models/
│   │   ├── Competition.js        # Competiciones, rondas y configuración
│   │   ├── Competitor.js         # Competidores, inscripciones y retiradas
│   │   ├── Result.js             # Tiempos, best y average por ronda
│   │   ├── AuditLog.js           # Registro inmutable de cambios de tiempos
│   │   └── User.js               # Usuarios del sistema (roles)
│   ├── routes/
│   │   ├── authRoutes.js         # Login, logout, registro, setup
│   │   ├── competitionRoutes.js  # CRUD de competiciones y gestión de rondas
│   │   ├── competitorRoutes.js   # CRUD de competidores y elegibles por ronda
│   │   ├── resultRoutes.js       # Guardado y consulta de tiempos
│   │   ├── auditRoutes.js        # Consulta del log de auditoría
│   │   └── sorRoutes.js          # Cálculo de SOR individual y de serie
│   ├── middleware/
│   │   ├── auth.js               # Verificación JWT y control de roles
│   │   └── validateObjectId.js   # Validación de parámetros ObjectId
│   └── utils/
│       └── wcaLogic.js           # Lógica WCA: stats, avances, SOR, grupos de edad
└── client/
    └── src/
        ├── pages/
        │   ├── Home.jsx              # Calendario de competiciones + creación
        │   ├── CompetitionDetails.jsx # Vista principal de gestión de una competición
        │   ├── Projector.jsx         # Pantalla de proyector con scroll y podio
        │   └── SeriesSOR.jsx         # Ranking SOR agregado de una serie
        ├── components/
        │   ├── CompetitionList.jsx       # Lista de competiciones por estado
        │   ├── ResultsTable.jsx          # Tabla de resultados con colores de clasificación
        │   ├── TimeEntryForm.jsx         # Formulario de entrada de tiempos
        │   ├── SORTable.jsx              # Tabla de clasificación SOR
        │   ├── CompetitorEditorModal.jsx # Editor inline de competidores (SuperAdmin)
        │   ├── AuditModal.jsx            # Historial de cambios de tiempos
        │   ├── RoundSettingsModal.jsx    # Configuración de formato y avance por ronda
        │   ├── LoginModal.jsx            # Modal de inicio de sesión
        │   └── RegisterModal.jsx        # Modal de registro de usuarios
        └── utils/
            └── formatters.js         # Conversión y formateo de tiempos WCA
```

**Decisiones de diseño relevantes:**

- Toda la lógica matemática WCA (cálculo de promedios, desempates, avances, SOR) reside exclusivamente en `server/utils/wcaLogic.js` y `client/src/utils/formatters.js`. El resto de la app la consume, nunca la reimplementa.
- El estado de autenticación vive únicamente en memoria React, obtenido de `/api/auth/me` al cargar. No hay datos de sesión en `localStorage`.
- Los WebSockets emiten el payload de resultados ya procesado, no una señal de "recarga". Los clientes actualizan su estado sin GET adicionales.

---

## Instalación

### Requisitos previos

- Node.js 18 o superior
- Una instancia de MongoDB (local o Atlas)

### Pasos

```bash
# 1. Clona el repositorio
git clone https://github.com/BG-101/competiciones-AAS.git
cd competiciones-AAS

# 2. Instala las dependencias del servidor
cd server
npm install

# 3. Instala las dependencias del cliente
cd ../client
npm install

# 4. Configura las variables de entorno (ver sección siguiente)
cd ../server
cp .env.example .env
# Edita .env con tus valores

# 5. Arranca el servidor (desde /server)
npx nodemon index.js

# 6. Arranca el cliente (desde /client, en otra terminal)
npm run dev
```

El servidor corre por defecto en `http://localhost:3001` y el cliente en `http://localhost:5173`.

---

## Variables de entorno

Crea el archivo `server/.env` con los siguientes valores:

```env
# Conexión a MongoDB (URI completa con usuario y contraseña)
MONGO_URI=mongodb+srv://<usuario>:<password>@cluster.mongodb.net/<dbname>

# Secreto para firmar los JWT (genera uno con el comando de abajo)
JWT_SECRET=<string_aleatorio_64_bytes>

# Entorno de ejecución
NODE_ENV=development   # o "production"

# Habilita el endpoint de inicialización del primer SuperAdmin
# Déjalo sin definir o en "false" en producción
ALLOW_SETUP=true
```

Para generar un `JWT_SECRET` seguro:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Inicialización del sistema

La primera vez que arranques el servidor necesitas crear el usuario SuperAdmin:

1. Asegúrate de que `ALLOW_SETUP=true` está en tu `.env`.
2. Haz una petición POST al endpoint de setup:

```bash
curl -X POST http://localhost:3001/api/auth/setup
```

Esto crea el usuario `admin` con contraseña `admin123`.

3. **Cambia la contraseña inmediatamente** desde el panel de administración o directamente en la base de datos.
4. Una vez inicializado, elimina `ALLOW_SETUP=true` del `.env` o cámbialo a `false`. El endpoint quedará bloqueado con 403.

---

## Roles y permisos

| Rol          | Descripción                | Permisos                                                                                     |
| ------------ | -------------------------- | -------------------------------------------------------------------------------------------- |
| `SuperAdmin` | Administrador total        | Crear competiciones, gestionar usuarios, editar competidores, vaciar papelera, ver auditoría |
| `Delegado`   | Organizador de competición | Inscribir competidores, introducir tiempos, gestionar rondas, ver auditoría                  |
| `Espectador` | Solo lectura               | Ver resultados en tiempo real, acceder al proyector                                          |

Los usuarios sin sesión iniciada pueden ver la lista de competiciones y los resultados públicos.

---

## Funcionalidades principales

### Competiciones y series

Las competiciones pueden agruparse en **series** (ligas). Los competidores inscritos en una competición de una serie se inscriben automáticamente en todas las demás competiciones de la misma.

### Gestión de rondas

Cada evento de una competición tiene una o varias rondas configurables con:

- **Formato**: Ao5, Mo3 o Bo3.
- **Cutoff**: tiempo límite para completar todos los intentos.
- **Avance**: por porcentaje del total o por top fijo (ej: top 16).
  Una ronda debe cerrarse con el candado antes de poder abrir la siguiente.

### Sistema SOR

Cuando está activado, genera una clasificación global sumando el rango de cada competidor en cada evento. Dos modalidades:

- **SOR clásico**: menor puntuación = mejor.
- **Estilo F1**: puntos por posición (25-18-15-12-10-8-6-4-2-1), mayor puntuación = mejor.
  El SOR puede consultarse por competición individual o de forma agregada para toda la serie desde `/series/:seriesName/sor`.

### Separación por grupos de edad

Cuando está activada, la clasificación entre rondas es completamente independiente por grupo: el corte se aplica sobre el total de competidores de cada categoría por separado. La tabla de resultados incluye pestañas para filtrar por grupo.

### Modo Proyector

Accesible desde `/projector/:id/:event/:round`. Diseñado para mostrarse en un monitor o proyector durante la competición:

- **Modo Lista**: tabla de resultados con scroll automático continuo.
- **Modo Podio**: animación de aparición de los top 3 al cerrar una ronda final.
  Alterna automáticamente entre ambos modos. Actualización en tiempo real por WebSocket.

### Retiradas de ronda

Los admins pueden marcar a un competidor clasificado como retirado de la siguiente ronda. El slot de clasificación se transfiere automáticamente al siguiente competidor en el ranking WCA.

---

## API

Todos los endpoints protegidos requieren una cookie `jwtToken` válida.

| Método | Endpoint                                          | Auth           | Descripción                                  |
| ------ | ------------------------------------------------- | -------------- | -------------------------------------------- |
| POST   | `/api/auth/login`                                 | —              | Inicia sesión                                |
| GET    | `/api/auth/me`                                    | ✅             | Verifica sesión activa                       |
| POST   | `/api/auth/logout`                                | —              | Cierra sesión                                |
| POST   | `/api/auth/register`                              | SuperAdmin     | Crea un nuevo usuario                        |
| POST   | `/api/auth/setup`                                 | —              | Inicialización (requiere `ALLOW_SETUP=true`) |
| GET    | `/api/competitions`                               | —              | Lista todas las competiciones activas        |
| GET    | `/api/competitions/:id`                           | —              | Detalle de una competición                   |
| POST   | `/api/competitions`                               | SuperAdmin     | Crea una competición                         |
| DELETE | `/api/competitions/:id`                           | SuperAdmin     | Soft delete de una competición               |
| POST   | `/api/competitions/:id/next-round`                | Admin/Delegado | Abre la siguiente ronda                      |
| PUT    | `/api/competitions/:id/round-settings`            | Admin/Delegado | Actualiza configuración de ronda             |
| PUT    | `/api/competitions/:id/round-status`              | Admin/Delegado | Abre o cierra una ronda                      |
| GET    | `/api/competitors/:compId`                        | —              | Lista competidores de una competición        |
| GET    | `/api/competitors/:compId/eligible/:event/:round` | —              | Competidores elegibles para una ronda        |
| POST   | `/api/competitors`                                | Admin/Delegado | Inscribe un competidor                       |
| PUT    | `/api/competitors/:id`                            | SuperAdmin     | Edita los datos de un competidor             |
| DELETE | `/api/competitors/:id`                            | Admin/Delegado | Soft delete de un competidor                 |
| DELETE | `/api/competitors/empty-trash/:compId`            | SuperAdmin     | Vacía la papelera de una competición         |
| PATCH  | `/api/competitors/:id/withdraw`                   | Admin/Delegado | Marca o desmarca una retirada de ronda       |
| GET    | `/api/results/:compId/:event/:round`              | —              | Resultados de una ronda                      |
| POST   | `/api/results`                                    | Admin/Delegado | Guarda los tiempos de un competidor          |
| GET    | `/api/audit/:compId`                              | Admin/Delegado | Log de auditoría de una competición          |
| GET    | `/api/sor/:compId`                                | —              | Ranking SOR de una competición               |
| GET    | `/api/sor/series/:seriesName`                     | —              | Ranking SOR agregado de una serie            |

---

## Seguridad

- **Autenticación**: JWT firmado almacenado en cookie `httpOnly`, inaccesible desde JavaScript del cliente.
- **Autorización**: middleware `auth(roles[])` en todos los endpoints que lo requieren.
- **Rate limiting**: máximo 10 intentos de login cada 15 minutos; máximo 100 peticiones de escritura por minuto en el resto de endpoints.
- **Sanitización**: `express-mongo-sanitize` previene inyecciones de operadores MongoDB.
- **Cabeceras HTTP**: `helmet` configura cabeceras de seguridad estándar.
- **Soft delete**: los competidores y competiciones borrados no se eliminan físicamente, se marcan con `isDeleted: true` y se renombran para liberar índices únicos.
- **Auditoría**: cada modificación de tiempos queda registrada en `AuditLog` con el estado anterior y el nuevo, accesible solo para admins.

---

_Desarrollado para la Asociación Almeriense de Speedcubing._
