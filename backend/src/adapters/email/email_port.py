from typing import Protocol


class EmailPort(Protocol):
    async def send_welcome_email(
        self, to: str, company_name: str, iso_standard: str
    ) -> None: ...