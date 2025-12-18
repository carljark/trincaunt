describe('Trincaunt E2E Flows', () => {
  const uniqueEmail = `test${Date.now()}@example.com`;

  it('Debe permitir registrar un usuario y crear un grupo', () => {
    // 1. Visitar la app
    cy.visit('http://localhost:5173'); // Asumiendo puerto default de Vite

    // 2. Registro
    cy.get('input[placeholder="Nombre"]').type('Usuario Test');
    cy.get('input[placeholder="Email"]').type(uniqueEmail);
    cy.get('input[placeholder="Password"]').type('123456');
    cy.contains('Registrarse').click();

    // 3. Verificar login exitoso
    cy.contains('Bienvenido, Usuario Test').should('be.visible');

    // 4. Crear Grupo
    cy.window().then(win => {
      cy.stub(win, 'prompt').returns('Viaje a la Playa');
    });
    cy.contains('Crear Nuevo Grupo').click();

    // 5. Verificar grupo en lista
    cy.contains('Viaje a la Playa').should('be.visible');
    cy.contains('1 miembros').should('be.visible');
  });
});