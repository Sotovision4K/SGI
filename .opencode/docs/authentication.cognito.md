### Cognito authentication

## frontend

- Mostly all the feature is already build. 
- Create the api connection to he backend, use VITE ENV for this.
- rename signin route with prefix /auth/signin
- vcreate /auth/logout
- create /auth/signup and change the existing one.
- the post-auth landing is `/processes` (no `/dashboard` route exists in the frontend). Backend exposes `GET /api/v1/processes` for the list.
- `/processes` must be a protected route, along with all `/processes/:processId/*` sub-routes.
- implement a business type dropdown if the user has selected company
- Remmeber client in spanish
- On the api, all should be authenticated, so pass the require token
- We need now, role base information. This is where we are going to distinct if is a consultor or a company
- The role is going to be sent as a custom attribute custom:role
- modify the current custom:nit for custom:govId
- the workflow for this is this :

SIGNUP          CONFIRMAR EMAIL       LOGIN / SESIÓN
─────────       ──────────────        ──────────────────────────
Custom UI       Custom UI             useAuth handles everything.
SignUpCommand   ConfirmSignUpCommand       │
(SDK)           (SDK)                      ├─ auth.signinRedirect()
                       │                    ├─ auth.user
                       │                    ├─ auth.isAuthenticated
                       └──► redirect ──────►├─ auth.signoutRedirect()
                            a Hosted UI      └─ token automatic refresh

- pass a searchParam on the route. 
- the post-auth landing route should be a protected route.
- all protected frontend routes use clean plural paths (e.g. `/processes`, `/processes/:processId/diagnose`). The API client (`lib/api-client.ts`) automatically prefixes `${VITE_API_BASE_URL}/api/v1` so frontend URLs never expose the API version.


## Backend

- fastapi 0.136.3
- Amazon RDS(Postgres Engine)
- uv 

- run the application in docker
- When creating the models (entities), match all types in the tables
- create ConfigDict as follow
```python
from pydantic_settings import BaseSettings
from pydantic import ConfigDict
class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env")
```


```python
from fastapi.middleware.cors import CORSMiddleware

- Implement CORS, allow localhost:5173
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```


# Requirements for authentication

- Create the get_current_user
- Create an adapter for Cognito implementation and create a Port as an abstract class to stablish the contract. Use pydantic protocol
- Create the model using pydantic basemodel
- DO NOT write CREATE USER, this is going to be created from the posttrigger
- You can write the /me endpoint
- Create update user endpoint
- The /me endpoint will retrieve all information from the user. 
- Create the api/dashboard endpoint this will retrieve all process (process retrieval not implemented YET)
- User Table is define as follow

-- Tabla de usuarios (base para todos los roles)
CREATE TABLE `users` (
  `user_id` UUID4,
  `role` ENUM("admin", "evaluator", "customer"),
  `email` VARCHAR(255),
  `full_name` VARCHAR(100),
  `gov_id` VARCHAR(20),
  `created_at` DATETIME,
  `is_active` BOOLEAN,
  PRIMARY KEY (`user_id`),
  KEY `Key` (`role`, `email`, `last_name`, `gov_id`)
);

-- Perfil de cliente (datos específicos, opcional si se prefiere una sola tabla)
CREATE TABLE `company` (
  `company_id` UUID4,
  `user_id` UUID4,
  `business_type` VARCHAR(50),
  `is_active` BOOLEAN,
  PRIMARY KEY (`company_id`),
  KEY `Key` (`user_id`, `customer_type`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE
);

-- Perfil de evaluador (datos adicionales del consultor)
CREATE TABLE `consultant` (
  `consultan_id` UUID4,
  `user_id` UUID4,
  `years_experience` INT,
  `certifications` VARCHAR(200),
  PRIMARY KEY (`consultan_id`),
  KEY `Key` (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE
);


- DO NOT GENERATE TOKEN FROM BACKEND
- Verify Authentication : Bearer + "ey..." 
- Create CognitoUser adapter and Port
```python
import httpx
from cachetools import TTLCache
import jwt
from jwt import PyJWKClient
from typing import Dict, Any

class CognitoAdapter:
    def __init__(self, jwks_url: str, audience: str, issuer: str, cache_ttl: int = 3600):
        self.jwks_url = jwks_url
        self.audience = audience
        self.issuer = issuer
        # Cache para el cliente JWKS (descarga las claves y las guarda internamente)
        self.jwks_client = PyJWKClient(jwks_url, cache_keys=True)
        # Opcional: cache adicional para payloads ya verificados (TTL menor que el token)
        self.payload_cache = TTLCache(maxsize=1000, ttl=300)
    def verify_token(self, token : str)
```
- Create CognitoPort Class for abstract implementation

```python
from typing import Protocol, Dict, Any

class CognitoPort(Protocol):
    def verify_token(self, token: str) -> Dict[str, Any]: ...
```

-  create get_current_user(credentials: HTTPAuthorizationCredentials,  verifier: CognitoAdapter), depends on verify_token
- Preffer dependency injection for this
-  create /api/v1/processes endpoint (list current user's processes). The legacy `/api/dashboard` route is deprecated.




# project structure on the backend

backend/
│
├── src/
│   ├── domain/                     # Core business logic & interfaces (ports)
│   │   ├── entities/               # Plain business models 
│   │   ├── repositories/           # Abstract interfaces for data access (ports)
│   │   └── services/               # Domain services (pure business rules)
│   │
│   ├── routes/                     # Routes – orchestrate domain & ports
│   │   ├── user/                   # User's routes
│   │   
│   │
│   ├── adapters/                   # Concrete implementations of ports
│   │   ├── db/                     # Outbound adapters for databases (PostgreSQL, etc.)
│   │   └── api/                    # Inbound adapters – FastAPI routers & schemas
│   │
│   ├── config/                     # Configuration (settings, database connections)
│   │
│   ├── trigger/                    # Lambda triggers (e.g., S3, DynamoDB Streams, Cron)
│   │
│   └── main.py                     # App factory – wires all adapters & use cases
│
├── tests/                          # Unit and integration tests
│   ├── unit/                       # Test domain & application in isolation
│   └── integration/                # Test adapters & API endpoints
│
├── docker-compose.yml              # Local dev services (PostgreSQL, etc.)
├── Dockerfile
├── requirements.txt / pyproject.toml
└── .env.example

