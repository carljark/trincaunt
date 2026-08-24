const fs = require('fs');
let file = fs.readFileSync('client/src/components/AddExpenseModal.scss', 'utf8');

// replace the media query we just added
file = file.replace(/@media \(max-width: 768px\) \{[\s\S]*$/, `@media (max-width: 768px) {
  .modal-overlay {
    align-items: flex-start;
    padding-top: calc(env(safe-area-inset-top, 20px) + 10px);
  }
  .modal-content {
    width: 95%;
    max-height: calc(100vh - env(safe-area-inset-top, 20px) - env(safe-area-inset-bottom, 20px) - 20px);
    padding: 15px;
    display: flex;
    flex-direction: column;

    form {
      flex: 1;
      overflow-y: auto;
      
      .modal-actions {
        margin-top: auto;
        padding-top: 15px;
        padding-bottom: 15px;
        position: sticky;
        bottom: 0;
        background: inherit;
        z-index: 10;
      }
    }
  }
}`);

fs.writeFileSync('client/src/components/AddExpenseModal.scss', file);
