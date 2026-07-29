# Personal dotfiles
Using [chezmoi](https://www.chezmoi.io/) to manage all config files in this repository.

### Setting up a new machine
1. Prerequisite: Setup bitwarden for fetching secrets and other identity info.
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.6/install.sh | bash
npm install --global @bitwarden/cli
bw login
export BW_SESSION="$(bw unlock --raw)"
```

2. Apply chezmoi
```bash
chezmoi init --apply sachingodishela
unset BW_SESSION
```

### Applications
|Name|Purpose|Files|
|-|-|-|
|[bitwarden](https://bitwarden.com/help/cli/)|Passwords and secret manager|
|git|version control|[.gitconfig](/dot_gitconfig)
|[neovim](https://neovim.io/)|Primary text editor|[nvim](/dot_config/nvim)
|[tmux](https://github.com/tmux/tmux/wiki)|Terminal multiplexer|[.tmux.conf](/dot_tmux.conf)
|[chezmoi](https://www.chezmoi.io/)|Dotfiles and personal system configuration management|[dotfiles](/)
|nvm + node||
[copilot-cli](https://github.com/features/copilot/cli)||[.copilot](/dot_copilot)
[celigo-cli](https://developer.celigo.com/cli)|
[qBittorrent](https://www.qbittorrent.org/)|

### Key Bindings
|Binding|Action|
|-|-|
|meta + l|lock|
|meta + i|settings|
|meta + f|firefox|
|meta + shift + s|screenshot|
|alt + space|raycast / ulauncher|

### Automations & Customizations
- Monitor brightness to be controlled natively with keyboard brightness keys.
- Books in `~/Books` folder to be auto uppdated on Notion upon edit (annotations). Book's name ends with `<page_id>`.
