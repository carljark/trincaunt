# Guía de Estilos Trincaunt

Este documento describe el sistema de diseño y las convenciones CSS del proyecto.

## 1. Sistema de Diseño

### Colores

| Variable          | Uso                  | Valor HEX  |
|-------------------|----------------------|------------|
| `$color-primary`  | Acciones principales | #4361ee    |
| `$color-secondary`| Acciones secundarias | #7209b7    |
| `$color-success`  | Éxito/confirmación   | #4cc9f0    |
| `$color-danger`   | Error/eliminar       | #f72585    |
| `$color-warning`  | Advertencia          | #f8961e    |
| `$color-gray-100` | Fondo claro          | #f8f9fa    |
| `$color-gray-900` | Texto oscuro         | #212529    |

### Tipografía

- **Fuente principal**: Inter (sans-serif)
- **Tamaño base**: 16px (1rem)
- **Escala**:
  ```scss
  h1: 2.5rem
  h2: 2rem
  h3: 1.75rem
  h4: 1.5rem
  ```

### Espaciado

Basado en múltiplos de 8px (0.5rem):

```scss
$spacing-scale: (
  1: 0.25rem,  // 4px
  2: 0.5rem,   // 8px
  3: 0.75rem,  // 12px
  4: 1rem,     // 16px
  5: 1.5rem,   // 24px
  6: 2rem      // 32px
);
```

## 2. Componentes Base

### Botones

```html
<button class="btn btn-primary">Primario</button>
<button class="btn btn-outline-primary">Outline</button>
<button class="btn btn-sm">Pequeño</button>
```

### Formularios

```html
<div class="form-group">
  <label>Nombre</label>
  <input type="text" class="form-control">
</div>
```

### Cards

```html
<div class="card">
  <div class="card-header">Título</div>
  <div class="card-body">
    <h5 class="card-title">Título card</h5>
    <p class="card-text">Contenido</p>
  </div>
</div>
```

## 2.1 Patrones de pantalla (estilo general)

Base del estilo común para todas las pantallas, aplicado ya en las pestañas **Grupo** (`GroupSettingsTab`) y **Saldos** (`BalancesTab`). Son mixins de `abstracts/_mixins.scss`: cada bloque BEM los incluye en sus propios elementos, sin clases globales nuevas.

| Mixin | Uso | Valores clave |
|-------|-----|---------------|
| `section-card` | Cada sección de una pantalla | fondo blanco, borde `$color-border`, radio `$border-radius-lg`, padding 16px, separación interna 12px |
| `section-title` | Título de la sección | 18px (`lg`), semibold |
| `list-row` | Filas de listas (miembros, saldos) | mínimo 48px de alto, texto 16px, separador entre filas |
| `money` | Importes | cifras tabulares, semibold, sin saltos de línea |
| `icon-button` | Acciones de icono (editar, añadir) | 44x44px, icono 20px, fondo primario al 8% |
| `action-button` | Botones de texto | mínimo 44px de alto, texto 16px semibold |

Reglas de texto:

- **Texto normal: 16px** (`base`). Etiquetas secundarias: 14px (`sm`) en `$color-text-muted`. No bajar de 14px.
- **Importes**: `$color-positive` (verde) a favor y `$color-negative` (rojo) en contra; nunca `success`/`danger`, que son cian y magenta.
- Entre secciones, 16px (`spacing 4`); dentro de una sección, 12px (`spacing 3`).
- Iconos: `components/icons.tsx` (SVG de trazo, `currentColor`). El botón lleva `aria-label`.

## 3. Breakpoints

| Nombre | Ancho  | Uso                  |
|--------|-------|----------------------|
| `xs`   | <576px | Móviles pequeños     |
| `sm`   | ≥576px | Móviles grandes      |
| `md`   | ≥768px | Tablets              |
| `lg`   | ≥992px | Laptops              |
| `xl`   | ≥1200px| Escritorios          |

Uso en SCSS:
```scss
@include respond-above(md) {
  // Estilos para tablets y mayores
}
```

## 4. Mejores Prácticas

1. **Mobile-first**: Escribir estilos base para móviles y luego sobreescribir para pantallas mayores
2. **Utilizar variables**: Nunca usar valores hardcodeados
3. **Extender componentes**: Usar `@extend` para mantener consistencia
4. **BEM en todos los componentes** (un bloque por componente; al tocar estilos de un componente con clases globales antiguas, migrarlo):
   ```scss
   .expense-item {
     &__description { /* ... */ }
     &--highlighted { /* ... */ }
   }
   ```