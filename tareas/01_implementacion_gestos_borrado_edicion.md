# Implementación de Gestos Táctiles (Swipe) para Edición y Borrado de Gastos

## Propósito
Mejorar la experiencia de usuario (UX) en dispositivos móviles al interactuar con la lista de gastos. Los botones clásicos de "Editar" y "Borrar" resultaban visualmente pesados y poco ergonómicos en pantallas pequeñas. Se ha implementado un patrón de diseño móvil estándar (Swipe-to-Action) que oculta los botones por defecto y permite revelarlos o ejecutarlos arrastrando el elemento hacia los laterales. Al mismo tiempo, se ha refinado el diseño en escritorio para mostrar iconos limpios sin fondos invasivos.

## Arquitectura y Flujo
Se ha abstraído la lógica de renderizado individual de un gasto (que antes residía dentro del iterador en `GroupDetailPage.tsx`) hacia un nuevo componente funcional de React llamado `SwipeableExpenseItem`.
1. **Detección de eventos táctiles:** El componente captura `onTouchStart`, `onTouchMove` y `onTouchEnd`.
2. **Cálculo de desplazamiento:** Se calcula el delta (diferencia) en el eje X respecto a la posición inicial de toque, limitando el arrastre a un máximo de 100px.
3. **Feedback visual:** El contenido principal del gasto se traslada mediante CSS `transform: translateX()`, revelando capas subyacentes rojas o verdes según la dirección del arrastre.
4. **Ejecución condicional:** Al soltar el dedo (`onTouchEnd`), si el desplazamiento supera un umbral de 80px, se dispara la función de callback correspondiente (`onEdit` u `onDelete`).
5. **Comportamiento Responsivo:** Mediante *Media Queries* en SCSS, se desactivan los eventos visuales de swipe en pantallas >= 768px y se muestran los botones de escritorio rediseñados.

## Archivos Modificados
- **Creado:** `client/src/components/SwipeableExpenseItem.tsx` (Lógica de interfaz y gestos).
- **Creado:** `client/src/components/SwipeableExpenseItem.scss` (Estilos del componente, contenedores ocultos y media queries).
- **Modificado:** `client/src/pages/GroupDetailPage.tsx` (Refactorización para sustituir el HTML estático por el nuevo componente, inyectando las props `expense`, `onEdit` y `onDelete`).

## Detalles Técnicos
- **Ausencia de dependencias externas:** Para mantener el bundle ligero y reducir la deuda técnica, se ha evitado usar librerías pesadas de terceros (como `react-swipeable-list`), implementando la detección matemática de gestos mediante los hooks nativos `useRef` (para guardar referencias mutables de las coordenadas sin provocar re-renderizados) y el estado local `useState` (para controlar el desplazamiento `offset`).
- **Rendimiento UI:** La animación de arrastre no utiliza variables de estado en propiedades costosas de layout, sino que aplica el desplazamiento directamente sobre la propiedad CSS `transform`, garantizando delegación a la GPU y 60 FPS durante el gesto.
- **Formateo Numérico:** Se ha encapsulado temporalmente la función `formatCurrency` dentro del propio componente para preservar la coherencia visual (formateo 'es-ES' a 2 decimales) sin romper la arquitectura de importaciones existente.
