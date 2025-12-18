# Trincaunt

Plataforma para la gestión y compartición de gastos entre grupos de usuarios.

## Descripción

El objetivo del sistema es permitir a los usuarios:
- Crear cuentas y gestionar su perfil (con validaciones de unicidad de email).
- Crear grupos de usuarios.
- Gestionar gastos compartidos dentro de esos grupos.

El proyecto sigue una arquitectura separada con un Frontend en React y un Backend (API) conectado a MongoDB.

## Estructura del Proyecto

- `/api`: Código del servidor (Backend).
- `/client`: Código del cliente (Frontend React + Vite).
- `/cypress`: Pruebas End-to-End (E2E).
- `/scripts`: Scripts de utilidad para la configuración del proyecto.

## Requisitos Previos

- Node.js (v16 o superior)
- MongoDB (Instancia local o URI de conexión)

## Instalación

1. **Instalar dependencias de la raíz (Cypress):**
   ```bash
   npm install
   ```

2. **Instalar dependencias del Cliente:**
   ```bash
   cd client
   npm install
   ```

3. **Instalar dependencias del Servidor:**
   ```bash
   cd api
   npm install
   ```

## Ejecución

### 1. Base de Datos
Asegúrate de que tu instancia de MongoDB esté en ejecución.

### 2. Servidor (API)
```bash
cd api
npm start
```

### 3. Cliente (Frontend)
```bash
cd client
npm run dev
```
La aplicación estará disponible en `http://localhost:5173`.

## Pruebas

### Pruebas E2E (Cypress)
Desde la raíz del proyecto, puedes ejecutar las pruebas de integración que verifican el flujo completo (Registro -> Login -> Crear Grupo).

**Modo Interactivo (GUI):**
```bash
npm run cy:open
```

**Modo Headless (Consola/CI):**
```bash
npm run cy:run
```