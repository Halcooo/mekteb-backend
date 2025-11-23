# Mekteb E-Dnevnik Backend API

A comprehensive school management system backend built with Node.js, Express, TypeScript, and MySQL.

## 🚀 Features

- **Authentication System**: JWT-based authentication with role-based access control
- **Student Management**: Complete CRUD operations for student records
- **Attendance Tracking**: Real-time attendance management with auto-save functionality
- **News Management**: School announcements and news system
- **File Upload**: Secure file upload handling with Multer
- **RESTful API**: Well-structured REST endpoints with proper HTTP status codes
- **Database Integration**: MySQL integration with connection pooling
- **Security**: CORS enabled, input validation, and secure authentication

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MySQL
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Multer
- **Development**: tsx for TypeScript execution
- **Password Hashing**: bcrypt

## 📋 Prerequisites

- Node.js (version 16 or higher)
- MySQL (version 8.0 or higher)
- npm or yarn package manager

## ⚙️ Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd mekteb-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_USER=your_mysql_username
   DB_PASSWORD=your_mysql_password
   DB_NAME=mekteb_db

   # JWT Configuration
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRES_IN=7d
   JWT_REFRESH_EXPIRES_IN=30d

   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # CORS Configuration
   FRONTEND_URL=http://localhost:5173
   ```

4. **Database Setup**
   - Create a MySQL database named `mekteb_db`
   - The application will create tables automatically on first run
   - Default admin user: `halid.lihovac` / `1qw23er4`

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## 📚 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication Endpoints

#### POST /auth/login
Login with username and password
```json
{
  "username": "halid.lihovac",
  "password": "1qw23er4"
}
```

#### POST /auth/register
Register a new user
```json
{
  "username": "john.doe",
  "email": "john@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "role": "teacher"
}
```

### Student Management Endpoints

#### GET /students
Get all students with pagination and search
```
Query parameters:
- page: Page number (default: 1)
- limit: Items per page (default: 10)
- search: Search term for name/email
```

#### POST /students
Create a new student
```json
{
  "firstName": "Student",
  "lastName": "Name",
  "email": "student@example.com",
  "studentId": "ST001",
  "gradeLevel": "10",
  "dateOfBirth": "2005-01-01"
}
```

#### PUT /students/:id
Update student information

#### DELETE /students/:id
Delete a student record

### Attendance Endpoints

#### GET /attendance
Get attendance records for a specific date
```
Query parameters:
- date: Date in YYYY-MM-DD format
```

#### POST /attendance
Create a single attendance record
```json
{
  "student_id": 1,
  "date": "2024-12-12",
  "status": "PRESENT"
}
```

#### POST /attendance/bulk
Create multiple attendance records
```json
{
  "attendanceList": [
    {
      "student_id": 1,
      "date": "2024-12-12",
      "status": "PRESENT"
    }
  ]
}
```

#### PUT /attendance/:id
Update attendance record status

#### GET /attendance/summary/:date
Get attendance summary for a specific date

### News Management Endpoints

#### GET /news
Get all news articles

#### POST /news
Create a new news article

#### PUT /news/:id
Update a news article

#### DELETE /news/:id
Delete a news article

## 🗃️ Database Schema

### Users Table
- id, username, email, password, role, firstName, lastName
- Roles: admin, teacher, student

### Students Table
- id, firstName, lastName, email, studentId, gradeLevel, dateOfBirth, phone, status

### Attendance Table
- id, student_id, date, status, created_at, updated_at
- Status: PRESENT, ABSENT, LATE, EXCUSED

### News Table
- id, title, content, author_id, created_at, updated_at

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run test` - Run test files

### Project Structure

```
src/
├── controllers/     # Route controllers
├── middleware/      # Custom middleware
├── routes/         # API routes
├── services/       # Business logic
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
├── db.ts           # Database connection
└── index.ts        # Application entry point
```

## 🚀 Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Set environment variables**
   - Configure production database
   - Set JWT secrets
   - Configure CORS for production domain

3. **Start the server**
   ```bash
   npm start
   ```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 👥 Authors

- **Halid Lihovac** - Initial work and development

## 🔗 Related Projects

- [Mekteb E-Dnevnik Frontend](../mekteb-e-dnevnik) - React frontend application

---

## 📖 Code Organization & Architecture Guide

### 🏗️ Project Structure

```
backend/src/
├── controllers/        # HTTP request handlers
├── services/          # Business logic & DB operations
├── routes/            # API endpoint definitions
├── middleware/        # Express middleware
├── utils/             # Helper functions
├── db.ts              # Database connection
└── index.ts           # App setup & route registration
```

### 📝 Key Naming Patterns

| Type | Convention | Example |
|------|-----------|---------|
| Controllers | `*Controller.ts` | `StudentController.ts` |
| Services | `*Service.ts` | `StudentService.ts` |
| Routes | `*Routes.ts` | `studentRoutes.ts` |
| DB columns | snake_case | `first_name` |
| API fields | camelCase | `firstName` |

### 🏛️ MVC Pattern Flow

```
Request → Route → Controller → Service → Database
          ↓        ↓           ↓          ↓
        HTTP    Validate    Business   CRUD
```

### 📚 Service Layer Documentation

All services use JSDoc comments with parameters, return types, and examples:

```typescript
/**
 * Creates a new student with auto-generated parent key
 * @param data - Student creation data
 * @returns Promise<Student> - Created student
 * @throws Error if key generation fails
 */
static async createStudent(data: CreateStudentData): Promise<Student>
```

### ✅ Best Practices Applied

1. ✓ Services contain business logic
2. ✓ Controllers handle HTTP only
3. ✓ Database format (snake_case) vs API format (camelCase) conversion in services
4. ✓ JSDoc comments on all public methods
5. ✓ Error handling with descriptive messages
6. ✓ Consistent naming conventions across codebase