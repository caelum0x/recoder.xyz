# Recoder self-host machine image (Packer).
#
# Bakes Docker + the Recoder compose stack + the pinned substrate binaries so a
# booted instance runs Recoder via the recoder-selfhost.service systemd unit.
#
# Builders:
#   amazon-ebs.recoder   -> a real AMI (publishable, boot-to-run Recoder)
#   null.recoder         -> a generic builder that provisions ANY reachable host
#                           over SSH (bare metal, existing VM, Multipass, libvirt,
#                           a CI runner). This is the portable "qemu/null" path
#                           that does not require a cloud account to exercise the
#                           exact same provision.sh.
#
# Usage:
#   packer init   deploy/packer/recoder.pkr.hcl
#   packer validate deploy/packer/recoder.pkr.hcl
#   # AMI:
#   packer build -only='amazon-ebs.recoder' deploy/packer/recoder.pkr.hcl
#   # Generic host over SSH:
#   packer build -only='null.recoder' \
#     -var 'ssh_host=1.2.3.4' -var 'ssh_username=ubuntu' \
#     -var 'ssh_private_key_file=~/.ssh/id_ed25519' \
#     deploy/packer/recoder.pkr.hcl

packer {
  required_plugins {
    amazon = {
      source  = "github.com/hashicorp/amazon"
      version = ">= 1.3.0"
    }
  }
}

# --- Variables ---
variable "region" {
  type    = string
  default = "us-east-1"
}

variable "instance_type" {
  type    = string
  default = "t3.large"
}

variable "ami_name_prefix" {
  type    = string
  default = "recoder-selfhost"
}

# Source Ubuntu 22.04 LTS AMI owner (Canonical) — looked up by filter below.
variable "source_ami_filter_name" {
  type    = string
  default = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"
}

# Path to the repo root that will be uploaded into the image.
variable "repo_root" {
  type    = string
  default = "../.."
}

# --- Generic (null) builder SSH target ---
variable "ssh_host" {
  type    = string
  default = ""
}
variable "ssh_username" {
  type    = string
  default = "ubuntu"
}
variable "ssh_private_key_file" {
  type    = string
  default = ""
}

locals {
  timestamp     = formatdate("YYYYMMDD-hhmmss", timestamp())
  src_stage     = "/tmp/recoder-src"
  upload_root   = "${var.repo_root}/"
}

# --- AMI builder ---
source "amazon-ebs" "recoder" {
  region        = var.region
  instance_type = var.instance_type
  ami_name      = "${var.ami_name_prefix}-${local.timestamp}"

  source_ami_filter {
    filters = {
      name                = var.source_ami_filter_name
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["099720109477"] # Canonical
  }

  ssh_username = "ubuntu"

  launch_block_device_mappings {
    device_name           = "/dev/sda1"
    volume_size           = 40
    volume_type           = "gp3"
    delete_on_termination = true
  }

  tags = {
    Name    = "${var.ami_name_prefix}-${local.timestamp}"
    Project = "recoder"
    Role    = "selfhost"
  }
}

# --- Generic builder: provision an existing host over SSH (qemu/bare-metal/VM) ---
source "null" "recoder" {
  communicator         = "ssh"
  ssh_host             = var.ssh_host
  ssh_username         = var.ssh_username
  ssh_private_key_file = var.ssh_private_key_file
}

# --- Shared build: upload the repo, then run provision.sh ---
build {
  name = "recoder-selfhost"

  sources = [
    "source.amazon-ebs.recoder",
    "source.null.recoder",
  ]

  # Stage the repo into the builder. provision.sh rsyncs it to /opt/recoder.
  provisioner "file" {
    source      = local.upload_root
    destination = local.src_stage
  }

  # Bake Docker + build + image + systemd unit.
  provisioner "shell" {
    script          = "${path.root}/provision.sh"
    env = {
      RECODER_SRC = local.src_stage
    }
    # The script self-elevates with sudo when not root.
    execute_command = "chmod +x {{ .Path }}; {{ .Vars }} bash {{ .Path }}"
  }

  # Truthful post-provision verification: assert the image was actually built
  # and the systemd unit is enabled. Fails the Packer build if not.
  provisioner "shell" {
    inline = [
      "set -e",
      "sudo docker image inspect recoder/docker-backend:selfhost >/dev/null",
      "sudo docker image inspect recoder/governance-daemon:selfhost >/dev/null",
      "test -f /etc/systemd/system/recoder-selfhost.service",
      "test -f /opt/recoder/docker-compose.selfhost.yml",
      "test -f /opt/recoder/deploy/envoy/envoy.xds.yaml",
      "systemctl is-enabled recoder-selfhost.service",
      "echo 'recoder backend + governance images present, compose + envoy staged, selfhost service enabled'",
    ]
  }
}
