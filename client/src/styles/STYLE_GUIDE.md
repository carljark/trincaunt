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
4. **BEM para componentes complejos**:
   ```scss
   .expense-item {
     &__description { /* ... */ }
     &--highlighted { /* ... */ }
   }
   ```