describe('Camera and Receipt Upload Flow', () => {
  beforeEach(() => {
    // Register and log in a new user for a clean state
    cy.visit('http://localhost:5173/register');
    const uniqueEmail = `test-camera-${Date.now()}@example.com`;
    cy.get('input[name="nombre"]').type('Camera User');
    cy.get('input[name="email"]').type(uniqueEmail);
    cy.get('input[name="password"]').type('password123');
    cy.get('button[type="submit"]').click();

    // Verify login by checking for the welcome message on the home page
    cy.contains('Bienvenido, Camera User').should('be.visible');
  });

  it('should upload a receipt from the gallery', () => {
    // 1. Intercept the API call for uploading
    cy.intercept('POST', '/api/v1/receipts/upload').as('uploadReceipt');

    // 2. Click the "Cam->IA" button to open the modal
    cy.get('.camera-ia-button').click();

    // 3. The CameraCapture component is inside the modal.
    // Choose to upload from the gallery.
    const fixtureFile = 'ticket_compra_aldi.jpeg';
    cy.get('input[type=file]').selectFile(fixtureFile, { force: true });

    // 4. A preview of the selected image should be visible
    cy.get('.photo-preview img').should('be.visible');

    // 5. Click the upload button
    cy.contains('Subir Foto').click();

    // 6. Wait for the intercepted API call and assert its response
    cy.wait('@uploadReceipt').then((interception) => {
      expect(interception.response.statusCode).to.equal(200);
      expect(interception.response.body).to.have.property('success', true);
      expect(interception.response.body).to.have.property('filename');
    });

    // 7. Check for the success alert/message
    cy.on('window:alert', (str) => {
      expect(str).to.contain('Recibo subido con éxito');
    });
  });

  // The "Take Photo" test is more complex due to mocking the camera stream.
  // This test provides a foundation that can be expanded upon.
  it.skip('should capture a photo from the camera and upload it', () => {
    // This test would require mocking navigator.mediaDevices.getUserMedia,
    // which is possible in Cypress but can be complex.
    // For now, we are skipping it.
  });
});
