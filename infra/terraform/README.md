# Terraform

Terraform modules for Agent OS should provision infrastructure only:

- database
- object storage
- event transport
- observability
- sandbox worker substrate
- private network

Do not move Recoder task, memory, approval, or artifact semantics into Terraform modules.
