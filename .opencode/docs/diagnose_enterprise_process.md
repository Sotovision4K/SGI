
# Overall Description - DIAGNOSE PROCESS

- This is the initial task of our business logic. The consultor will be requesting information from the company so he can build the action plan to achieve the certification.
- Certifications are but not limited to ISO 9K1, ISO 45K1, ISO 14K1. These three are the most valuable for our business.
- The consultor can communicate with the LLM to build the plan. But he's also able to edit manually the diagnose. LLM is a copilot
- the LLM will extract the information from the prompt and build the diagnose. The backend will add aditional or standarized the response from the LLM.


# Frontend

- we need to create a new route, which is protected as well.
- Frontend route (clean URL, no API prefix): `/processes/{processId}/diagnose`
- API path (backend): `/api/v1/processes/{processId}/diagnose`
