-- 1. Essentials
vim.g.mapleader = " "
local opt = vim.opt
opt.number = true
opt.relativenumber = true
opt.shiftwidth = 4
opt.tabstop = 4
opt.expandtab = true
opt.termguicolors = true
opt.smartindent = true
opt.ignorecase = true
opt.smartcase = true
opt.signcolumn = "yes"
opt.scrolloff = 8
opt.undofile = true
opt.clipboard = "unnamedplus"
opt.autoread = true

-- Auto-reload files changed outside Neovim
vim.api.nvim_create_autocmd({ "FocusGained", "BufEnter", "CursorHold", "CursorHoldI" }, {
  pattern = "*",
  command = "if mode() !~ '\\v(c|r.?|!|t)' && getcmdwintype() == '' | checktime | endif",
})
vim.api.nvim_create_autocmd("FileChangedShellPost", {
  pattern = "*",
  command = "echohl WarningMsg | echo 'File changed on disk. Buffer reloaded.' | echohl None",
})

-- 2. Bootstrap Lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.uv.fs_stat(lazypath) then
  vim.fn.system({ "git", "clone", "--filter=blob:none", "https://github.com/folke/lazy.nvim.git", "--branch=stable", lazypath })
end
vim.opt.rtp:prepend(lazypath)

-- 3. Plugins
require("lazy").setup({
  { "catppuccin/nvim", name = "catppuccin", priority = 1000, config = function()
    vim.cmd.colorscheme "catppuccin-macchiato"
  end },

  -- LeetCode in Neovim (loads on :Leet)
  {
    "kawre/leetcode.nvim",
    cmd = "Leet",
    dependencies = {
      "nvim-telescope/telescope.nvim",
      "nvim-lua/plenary.nvim",
      "MunifTanjim/nui.nvim",
    },
    opts = { lang = "cpp" },
  },

  { "nvim-telescope/telescope.nvim", dependencies = { "nvim-lua/plenary.nvim" } },

  {
    "nvim-treesitter/nvim-treesitter",
    branch = "master",
    build = ":TSUpdate",
    config = function()
      require("nvim-treesitter.configs").setup({
        ensure_installed = { "cpp", "c", "lua", "vim", "vimdoc", "python", "java", "rust", "toml", "markdown", "markdown_inline" },
        highlight = { enable = true },
        indent = { enable = true },
      })
    end,
  },

  {
    "hrsh7th/nvim-cmp",
    event = "InsertEnter",
    dependencies = { "hrsh7th/cmp-nvim-lsp", "L3MON4D3/LuaSnip" },
    config = function()
      local cmp = require("cmp")
      cmp.setup({
        snippet = {
          expand = function(args) require("luasnip").lsp_expand(args.body) end,
        },
        mapping = cmp.mapping.preset.insert({
          ["<C-Space>"] = cmp.mapping.complete(),
          ["<CR>"]      = cmp.mapping.confirm({ select = true }),
          ["<Tab>"]     = cmp.mapping.select_next_item(),
          ["<S-Tab>"]   = cmp.mapping.select_prev_item(),
        }),
        sources = cmp.config.sources({
          { name = "nvim_lsp" },
          { name = "luasnip" },
        }),
      })
    end,
  },

  { "nvim-tree/nvim-web-devicons", opts = {} },
  {
    "nvim-neo-tree/neo-tree.nvim",
    branch = "v3.x",
    cmd = "Neotree",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "nvim-tree/nvim-web-devicons",
      "MunifTanjim/nui.nvim",
    },
    opts = {
      filesystem = {
        follow_current_file = { enabled = true },
        use_libuv_file_watcher = true,
      },
      window = { width = 30 },
    },
  },
  { "folke/which-key.nvim", event = "VeryLazy", opts = {} },
  { "windwp/nvim-autopairs", event = "InsertEnter", opts = {} },

  -- Mason: install LSP servers / debuggers / formatters via nvim
  { "williamboman/mason.nvim", opts = {} },
  {
    "WhoIsSethDaniel/mason-tool-installer.nvim",
    dependencies = { "williamboman/mason.nvim" },
    config = function()
      require("mason-tool-installer").setup({
        ensure_installed = { "jdtls", "java-debug-adapter", "java-test" },
        auto_update = false,
        run_on_start = true,
      })
    end,
  },
  -- Java LSP integration (configured in ftplugin/java.lua)
  { "mfussenegger/nvim-jdtls", ft = "java" },

  -- Rust: rustaceanvim wraps rust-analyzer (uses the one on $PATH from rustup)
  {
    "mrcjkb/rustaceanvim",
    version = "^6",
    lazy = false, -- plugin recommends not lazy-loading; it sets up its own ft hooks
    config = function()
      vim.g.rustaceanvim = {
        server = {
          capabilities = require("cmp_nvim_lsp").default_capabilities(),
        },
      }
    end,
  },
})

-- 4. C++ & LSP Setup (Native Neovim 0.11+)
vim.lsp.config('clangd', {
  capabilities = require('cmp_nvim_lsp').default_capabilities(),
})
vim.lsp.enable('clangd')

-- 5. Keybindings
local builtin = require('telescope.builtin')
local map = vim.keymap.set
map('n', '<leader>ff', builtin.find_files)
map('n', '<leader>fg', builtin.live_grep)
map('n', 'gd', vim.lsp.buf.definition)
map('n', 'K', vim.lsp.buf.hover)
map('n', '<leader>ca', vim.lsp.buf.code_action) -- Essential for Google L4 refactoring
map('n', '<leader>d', vim.diagnostic.open_float) -- show full diagnostic for current line
map('n', ']d', function() vim.diagnostic.jump({ count = 1,  float = true }) end)
map('n', '[d', function() vim.diagnostic.jump({ count = -1, float = true }) end)
map('n', '<leader>e', ':Neotree toggle<CR>', { silent = true })

-- Terminal
map('n', '<leader>tt', function()
  vim.cmd('botright 15split | terminal')
  vim.cmd('startinsert')
end)
map('n', '<leader>tv', function()
  vim.cmd('vsplit | terminal')
  vim.cmd('startinsert')
end)
map('t', '<Esc>', [[<C-\><C-n>]])
map('i', 'jj', '<Esc>')

-- Inside a terminal buffer: q (normal mode) closes the window
vim.api.nvim_create_autocmd("TermOpen", {
  callback = function(args)
    vim.keymap.set('n', 'q', '<cmd>bd!<CR>', { buffer = args.buf })
  end,
})

