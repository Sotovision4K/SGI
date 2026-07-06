import os
import logging
from datetime import datetime, timezone


def handler(event: dict, context: dict) -> dict:
    """
    AWS Lambda handler for post sign-up trigger.
    Creates user records in the database after Cognito sign-up confirmation.
    CRITICAL: Uses synchronous psycopg3 instead of deprecated asyncio pattern.
    
    NOTE: For production with high volume, consider using RDS Proxy for connection pooling:
    - RDS Proxy reduces connection overhead for serverless functions
    - Maintains persistent connections to reduce cold start time
    - Provides built-in credentials management
    - See: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html
    """
    database_url = os.environ.get("DATABASE_URL", "")
    # Strip SQLAlchemy dialect prefix for raw psycopg connection.
    # postgresql+asyncpg://... → postgresql://...
    if "+" in database_url and "://" in database_url:
        scheme, rest = database_url.split("://", 1)
        if "+" in scheme:
            database_url = scheme.split("+")[0] + "://" + rest


    trigger_source = event.get("triggerSource", "")

    try:
        if trigger_source == "PostConfirmation_ConfirmSignUp":
            user_attributes = event.get("request", {}).get("userAttributes", {})
            email = user_attributes.get("email")
            user_id = user_attributes.get("sub")
            full_name = user_attributes.get("name", "")
            gov_id = user_attributes.get("custom:govId", "")
            role = user_attributes.get("custom:role", "customer")

            logger.info(f"Post sign-up trigger: Creating user {email} with role {role}")

            # Use synchronous psycopg3 connection pool or direct connection (more compatible with Lambda)
            import psycopg
            
            with psycopg.connect(database_url) as conn:
                with conn.cursor() as cur:
                    try:
                        cur.execute(
                            """
                            INSERT INTO users (user_id, role, email, full_name, gov_id, created_at, updated_at, is_active)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (email) DO UPDATE SET
                                updated_at = %s,
                                is_active = %s
                            """,
                            (
                                user_id,
                                role,
                                email,
                                full_name,
                                gov_id,
                                datetime.now(timezone.utc).isoformat(),
                                datetime.now(timezone.utc).isoformat(),
                                True,
                                datetime.now(timezone.utc).isoformat(),
                                True,
                            ),
                        )
                        conn.commit()
                        logger.info(f"Successfully created user record for {email}")
                    except Exception as db_error:
                        conn.rollback()
                        logger.error(f"Database error creating user {email}: {str(db_error)}")
                        raise
    except Exception as e:
        logger.error(f"CRITICAL: User creation failed for email={email if trigger_source == 'PostConfirmation_ConfirmSignUp' else 'unknown'}: {str(e)}", exc_info=True)
        raise RuntimeError(f"Post sign-up trigger failed: {str(e)}") from e

    return event