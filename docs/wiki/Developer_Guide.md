# Developer Guide - دليل المطور

This guide provides information for developers contributing to the Dueli platform.

## Development Environment / بيئة التطوير

### Prerequisites / المتطلبات

- **Node.js**: Version 18 or higher
- **npm**: Latest version (comes with Node.js)
- **Git**: Version control system
- **VS Code**: Recommended editor with TypeScript support
- **Cloudflare Account**: For deployment and D1 database

### Recommended Extensions / الإضافات الموصى بها

- **TypeScript Importer**
- **Prettier**
- **ESLint**
- **GitLens**
- **Cloudflare Workers** extension

## Project Structure / هيكل المشروع

```
src/
├── core/                          # Shared infrastructure
│   ├── http/                      # HTTP abstractions
│   ├── database/                  # Database layer
│   └── i18n/                      # Internationalization
├── modules/                       # Business logic modules
│   ├── auth/                      # Authentication
│   ├── competitions/              # Competition management
│   ├── users/                     # User management
│   └── categories/                # Category management
├── client/                        # Frontend code
│   ├── core/                      # Client infrastructure
│   ├── services/                  # Client services
│   ├── ui/                        # UI components
│   └── helpers/                   # Utility functions
├── lib/                           # External integrations
└── config/                        # Configuration files
```

## Coding Standards / معايير البرمجة

### TypeScript Guidelines / إرشادات TypeScript

- **Strict Mode**: All TypeScript strict checks enabled
- **Type Safety**: Avoid `any` type, use proper interfaces
- **Interfaces**: Define clear interfaces for all data structures
- **Generics**: Use generics for reusable components

```typescript
// ✅ Good
interface User {
  id: number;
  email: string;
  username: string;
}

class UserRepository extends BaseRepository<User> {
  // Implementation
}

// ❌ Bad
function processUser(user: any) {
  // Avoid any
}
```

### Naming Conventions / اصطلاحات التسمية

- **Classes**: PascalCase (`UserController`, `AuthService`)
- **Methods**: camelCase (`getUser()`, `createCompetition()`)
- **Variables**: camelCase (`userId`, `competitionData`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_LIMIT`, `MAX_FILE_SIZE`)
- **Files**: PascalCase for classes, camelCase for utilities

### Code Organization / تنظيم الكود

- **Single Responsibility**: Each class/method has one purpose
- **DRY Principle**: Don't repeat yourself
- **SOLID Principles**: Follow object-oriented design principles
- **Dependency Injection**: Constructor injection preferred

## Architecture Patterns / أنماط الهيكلة

### Vertical Slice Architecture / الهيكلة العمودية الشرائحية

Each feature is self-contained:

```
modules/
└── competitions/
    ├── CompetitionRepository.ts    # Data access
    ├── CompetitionService.ts       # Business logic
    ├── CompetitionController.ts    # HTTP handlers
    ├── routes.ts                   # Route definitions
    └── index.ts                    # Module exports
```

### Repository Pattern / نمط المستودع

- **Abstraction**: Database-agnostic interface
- **Consistency**: Standardized CRUD operations
- **Testability**: Easy to mock for testing

```typescript
class CompetitionRepository extends BaseRepository<Competition> {
  async findByUserId(userId: number): Promise<Competition[]> {
    return this.findBy({ creator_id: userId });
  }
}
```

### Service Layer / طبقة الخدمات

- **Business Logic**: Complex operations and validations
- **Transaction Management**: Handle database transactions
- **External Integrations**: API calls, email sending

```typescript
class CompetitionService {
  async createCompetition(data: CreateCompetitionData): Promise<Result> {
    // Validation
    // Business logic
    // Database operations
    // Return result
  }
}
```

## Database Development / تطوير قاعدة البيانات

### Migrations / الترحيلات

- **Versioned**: Each change has a migration file
- **Reversible**: Migrations can be rolled back
- **Tested**: Test migrations before applying

```sql
-- migrations/001_initial_schema.sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  -- ... other fields
);
```

### Schema Design / تصميم المخطط

- **Normalization**: Appropriate normalization level
- **Indexing**: Strategic indexes for performance
- **Constraints**: Foreign keys and check constraints
- **Data Types**: Appropriate SQLite data types

### Query Optimization / تحسين الاستعلامات

- **Prepared Statements**: Prevent SQL injection
- **Efficient Queries**: Minimize data transfer
- **Pagination**: Implement proper pagination
- **Indexing**: Use indexes for frequent queries

## API Development / تطوير الواجهات

### RESTful Design / التصميم RESTful

- **Resource-based**: `/api/competitions`, `/api/users`
- **HTTP Methods**: GET, POST, PUT, DELETE appropriately
- **Status Codes**: Proper HTTP status codes
- **Consistent Responses**: Standardized response format

### Validation / التحقق

- **Input Validation**: Server-side validation required
- **Custom Validator**: Use built-in validator class
- **Error Messages**: Clear, localized error messages

```typescript
const schema = {
  title: ['required', 'string', { minLength: 5, maxLength: 200 }],
  description: ['string', { maxLength: 1000 }],
  category_id: ['required', 'number']
};

const result = Validator.validate(data, schema);
```

### Error Handling / معالجة الأخطاء

- **Try-Catch**: Wrap all operations
- **Custom Errors**: Meaningful error classes
- **Logging**: Log errors appropriately
- **User-Friendly**: Don't expose internal errors

## Frontend Development / تطوير الواجهة الأمامية

### State Management / إدارة الحالة

- **Global State**: User session, preferences
- **Reactive Updates**: Automatic UI updates
- **Persistence**: Local storage for preferences

### Component Structure / هيكل المكونات

- **Modular**: Reusable components
- **Props Interface**: Typed component props
- **Event Handling**: Proper event delegation

### Performance / الأداء

- **Code Splitting**: Lazy load components
- **Asset Optimization**: Compress images and code
- **Caching**: Browser caching strategies

## Testing / الاختبار

### Unit Tests / اختبارات الوحدة

- **Isolate Units**: Test classes and functions independently
- **Mock Dependencies**: Mock external dependencies
- **Edge Cases**: Test error conditions

### Integration Tests / اختبارات التكامل

- **API Endpoints**: Test complete request/response cycles
- **Database Operations**: Test with test database
- **External Services**: Mock external API calls

### Test Structure / هيكل الاختبار

```
__tests__/
├── unit/
│   ├── UserService.test.ts
│   └── Validator.test.ts
└── integration/
    ├── auth.test.ts
    └── competitions.test.ts
```

## Security / الأمان

### Authentication / المصادقة

- **Secure Sessions**: HTTP-only cookies
- **Password Hashing**: Strong hashing algorithms
- **OAuth Security**: State parameter validation

### Authorization / الترخيص

- **Role-Based**: Different permission levels
- **Resource Ownership**: Users can only modify their resources
- **API Keys**: Secure API key management

### Data Protection / حماية البيانات

- **Input Sanitization**: Sanitize all user inputs
- **SQL Injection**: Prepared statements
- **XSS Protection**: Content security policy
- **CSRF Protection**: Token-based protection

## Internationalization / التعريب

### Translation System / نظام الترجمة

- **Singleton Service**: Centralized translation management
- **Key-Based**: Use translation keys, not hardcoded strings
- **Pluralization**: Support for plural forms
- **RTL Support**: Right-to-left layout support

```typescript
// ✅ Good
const message = t('competition.created', lang, { title: competition.title });

// ❌ Bad
const message = 'Competition created successfully';
```

### Language Files / ملفات اللغة

- **Structured**: Organize by feature or section
- **Complete**: All languages have same keys
- **Context**: Include context for translators

## Deployment / النشر

### Cloudflare Workers / عمال Cloudflare

- **Edge Computing**: Global distribution
- **Environment Variables**: Secure secret management
- **D1 Database**: Serverless database

### CI/CD Pipeline / خط أنابيب CI/CD

- **Automated Testing**: Run tests on every push
- **Build Optimization**: Minify and optimize assets
- **Deployment**: Automated deployment to production

## Contributing Guidelines / إرشادات المساهمة

### Git Workflow / سير عمل Git

1. **Fork**: Fork the repository
2. **Branch**: Create feature branch (`feature/new-feature`)
3. **Commit**: Make small, focused commits
4. **Push**: Push to your fork
5. **Pull Request**: Create pull request with description

### Commit Messages / رسائل الالتزام

- **Format**: `type(scope): description`
- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`
- **Description**: Clear, concise description

```bash
# ✅ Good
git commit -m "feat(auth): add OAuth Google login"

# ❌ Bad
git commit -m "fixed stuff"
```

### Pull Request Process / عملية طلب السحب

- **Description**: Detailed description of changes
- **Tests**: Include tests for new features
- **Documentation**: Update documentation if needed
- **Review**: Address reviewer feedback

## Code Review Checklist / قائمة مراجعة الكود

### General / عام
- [ ] Code follows style guidelines
- [ ] No console.log statements
- [ ] Proper error handling
- [ ] Tests included

### TypeScript / TypeScript
- [ ] Type safety maintained
- [ ] No `any` types used
- [ ] Interfaces defined for data structures

### Security / الأمان
- [ ] Input validation implemented
- [ ] SQL injection prevented
- [ ] Authentication/authorization checked

### Performance / الأداء
- [ ] No N+1 queries
- [ ] Efficient database queries
- [ ] Proper pagination

## Debugging / التصحيح

### Local Development / التطوير المحلي

- **Wrangler Dev**: `npm run dev:sandbox`
- **Logging**: Use console methods appropriately
- **Breakpoints**: VS Code debugger support

### Production Debugging / تصحيح الإنتاج

- **Cloudflare Logs**: Access via dashboard
- **Error Monitoring**: Implement error tracking
- **Performance Monitoring**: Monitor response times

## Resources / الموارد

### Documentation / التوثيق

- [Architecture](Architecture.md) - System design
- [API Reference](API_Reference.md) - Complete API docs
- [Getting Started](Getting_Started.md) - Setup guide

### Tools / الأدوات

- **Wrangler**: Cloudflare CLI tool
- **D1 Console**: Database management
- **Cloudflare Dashboard**: Deployment and monitoring

### Community / المجتمع

- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: General discussions
- **Contributing Guide**: Detailed contribution guidelines

---

Happy coding! We welcome contributions from developers of all skill levels.

*برمجة سعيدة! نحن نرحب بالمساهمات من المطورين من جميع المستويات.*