# Project Index: Trincaunt Group Expense Control

This document provides an index of the API and Client applications, outlining their main components and purpose.

## 1. API Application (`./api`)

The API application is built with Node.js and TypeScript, following a typical MVC-like structure. It handles all backend logic, database interactions, and exposes RESTful endpoints for the client.

### Core Files:
-   `app.ts`: Main application setup, middleware, and route configuration.
-   `server.ts`: Entry point for starting the HTTP server.
-   `jest.config.js`: Configuration for Jest testing framework.
-   `package.json`: Project metadata and dependencies.
-   `tsconfig.json`: TypeScript compiler configuration.

### Directories:

#### `api/src/config/`
-   `db.ts`: Contains database connection configuration and setup.

#### `api/src/controllers/`
Handles incoming HTTP requests, processes input, and sends responses. It interacts with services to perform business logic.
-   `DebtTransactionController.ts`: Manages debt-related transactions.
-   `ExpenseController.ts`: Manages group expenses.
-   `GroupController.ts`: Manages group creation, membership, and related operations.
-   `UserController.ts`: Manages user authentication and profile operations.

#### `api/src/middlewares/`
Functions executed before the controllers to handle concerns like authentication and error handling.
-   `authMiddleware.ts`: Middleware for authenticating user requests (e.g., JWT verification).
-   `errorHandler.ts`: Global error handling middleware.

#### `api/src/models/`
Defines the structure of data and interacts with the database (likely using an ORM like Mongoose or TypeORM).
-   `DebtTransaction.ts`: Defines the schema for debt transactions.
-   `Expense.ts`: Defines the schema for group expenses.
-   `Group.ts`: Defines the schema for user groups.
-   `User.ts`: Defines the schema for user accounts.

#### `api/src/routes/`
Defures API endpoints and maps them to corresponding controller methods.
-   `index.ts`: Centralizes the import and registration of all specific route files.

#### `api/src/services/`
Contains the business logic. Controllers call services to perform specific operations, ensuring separation of concerns.
-   `DebtTransactionService.ts`: Business logic for debt transactions.
-   `ExpenseService.ts`: Business logic for expense management.
-   `GroupService.ts`: Business logic for group management.
-   `UserService.ts`: Business logic for user-related operations (e.g., registration, login).

#### `api/src/utils/`
Utility functions and helper classes used across the application.
-   `AppError.ts`: Custom error class for standardized error handling.

#### `api/tests/`
Contains unit and integration tests for the API.
-   `controllers/`: Tests for the controllers.
-   `services/`: Tests for the services.

---

## 2. Client Application (`./client`)

The client application is a React-based frontend built with Vite, providing the user interface for interacting with the API.

### Core Files:
-   `App.tsx`: The main root component of the React application.
-   `main.tsx`: Entry point for rendering the React application.
-   `index.html`: The main HTML file served by the application.
-   `vite-env.d.ts`: TypeScript declaration file for Vite environment variables.
-   `.env.development`: Environment variables for development.
-   `.env.production`: Environment variables for production.
-   `.eslintrc.cjs`: ESLint configuration for code linting.
-   `package.json`: Project metadata and dependencies.
-   `tsconfig.json`: TypeScript compiler configuration.
-   `tsconfig.node.json`: TypeScript configuration for Node.js specific files (like Vite config).
-   `vite.config.ts`: Vite build tool configuration.

### Directories:

#### `client/src/components/`
Reusable UI components used across different pages.
-   `AddExpenseModal.scss`: Styles for `AddExpenseModal.tsx`.
-   `AddExpenseModal.tsx`: Component for adding new expenses, likely a modal dialog.
-   `PaymentHistoryModal.tsx`: Component to display payment history, likely a modal dialog.
-   `RecordPaymentModal.tsx`: Component for recording payments, likely a modal dialog.

#### `client/src/contexts/`
React Context API providers for global state management.
-   `AuthContext.tsx`: Provides authentication-related state and functions to the application.

#### `client/src/pages/`
Top-level components representing different views or screens of the application.
-   `GroupDetailPage.scss`: Styles for `GroupDetailPage.tsx`.
-   `GroupDetailPage.tsx`: Displays details of a specific group, including expenses and members.
-   `HomePage.scss`: Styles for `HomePage.tsx`.
-   `HomePage.tsx`: The main landing page, likely showing a list of groups or a dashboard.
-   `LoginPage.scss`: Styles for `LoginPage.tsx`.
-   `LoginPage.tsx`: User login interface.
-   `RegisterPage.tsx`: User registration interface.

#### `client/src/styles/`
Global styles, variables, and common CSS utilities.
-   `_variables.scss`: SCSS variables for colors, fonts, spacing, etc.
-   `main.scss`: Main stylesheet, likely importing other style files.