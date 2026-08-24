# Refactorización del Anclaje del Botón Flotante (FAB)

## Propósito
El QuickExpenseFAB (Floating Action Button) presentaba problemas de usabilidad al cambiar de resolución o interactuar con los bordes de la pantalla (especialmente en dispositivos móviles con la aparición dinámica de la barra de direcciones/pestañas). Además, la expansión del botón se producía de forma asimétrica (hacia la derecha) y el "tirador" para moverlo podía quedar oculto fuera del área visible si se arrastraba demasiado cerca del borde derecho.

## Arquitectura y Flujo
La solución requirió redefinir el sistema de coordenadas del botón flotante y sus reglas de contención (clamping) dentro del viewport.
1. **Cambio de Origen de Coordenadas:** Se modificó la regla CSS y de estilo en línea para que las coordenadas (x,y) guarden la posición del **centro geométrico** del botón, no su esquina superior izquierda. Para ello se añadió `transform: translate(-50%, -50%)`.
2. **Reposicionamiento del Tirador:** El `drag-handle` fue movido de la esquina superior derecha (`right: -10px`) al centro superior (`left: 50%; transform: translateX(-50%)`) para asegurar que siempre sea accesible.
3. **Márgenes de Seguridad y Dynamic Viewport:** Se reemplazaron las unidades estáticas `vh` y `vw` por **`dvh` y `dvw`**, permitiendo que el componente reaccione a los cambios dinámicos del navegador en dispositivos móviles.
4. **Clamping:** Se endurecieron los límites matemáticos (`Math.min` y `Math.max`) en `GroupDetailPage.tsx` para forzar que el centro del botón no pueda sobrepasar el 95% del ancho ni bajar más allá del 85% del alto, protegiéndolo de elementos UI nativos.

## Archivos Modificados
- **Modificado:** `client/src/components/QuickExpenseFAB.tsx` (Lógica de contención matemática y `dvh`).
- **Modificado:** `client/src/components/QuickExpenseFAB.scss` (Traslación del contenedor y reposicionamiento del drag handle).

## Detalles Técnicos
- La transición de `vh` a `dvh` (Dynamic Viewport Height) es una técnica moderna de CSS que resuelve el problema histórico de WebKit/Blink en móviles, donde la altura de pantalla visible cambia constantemente al aparecer/desaparecer la barra de la URL.
- Al basar la traslación de CSS en porcentajes (`-50%`), el botón puede cambiar drásticamente de ancho (de un icono circular a un formulario expandido) y el navegador automáticamente equilibrará el desbordamiento hacia ambos lados de forma simétrica sin requerir recalculación mediante JavaScript.
