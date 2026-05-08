# Contributing to LanBox

Thanks for considering a contribution.

## Development Setup

1. Fork and clone the repository.
2. Create a virtual environment.
3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Run locally:

```bash
python server.py
```

## Branch and PR Guidelines

- Create a feature branch from `main`.
- Keep pull requests focused and small.
- Include a short "what changed and why" description.
- If UI/API behavior changes, update `README.md`.

## Code Style

- Follow PEP 8 for Python code.
- Keep frontend JavaScript and CSS readable and consistent.
- Prefer clear naming over clever shortcuts.

## Testing Checklist

Before opening a PR, verify:

- File upload, download, and delete work.
- Notes add/copy/delete work.
- UI layout is usable on mobile widths.
- `http://localhost:3000` opens without errors.

## Reporting Issues

When creating an issue, include:

- Expected behavior
- Actual behavior
- Steps to reproduce
- OS and Python version
