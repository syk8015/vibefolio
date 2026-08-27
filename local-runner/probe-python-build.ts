// Python build path probe (2026-08-20) — real E2B, no Anthropic API.
//
//   Part 1  detection: fixture trees written straight into a sandbox, then
//           detectPythonApp() asserted per case (framework, entry, ports,
//           framework-beats-static ordering signal, none-case null).
//   Part 2  serve: servePython() on the streamlit fixture — venv + pip install
//           + launch + ready-wait for real; asserts /_stcore/health == "ok".
//   Part 3  github E2E: buildAndServe("github", streamlit/streamlit-example)
//           — clone → requirements.txt install → serve. Skip with --skip-e2e.
//
// Run: npx tsx --env-file=.env.local local-runner/probe-python-build.ts
// Cost: E2B sandbox minutes only (a few cents).
import { Sandbox } from "e2b";
import { detectPythonApp, servePython, buildAndServe } from "./build";

let pass = 0;
let fail = 0;
function assert(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const FIXTURES: Record<string, Record<string, string>> = {
  // decoy docs/index.html MUST NOT shadow the app (python checked before static)
  "streamlit-decoy": {
    "app.py": "import streamlit as st\nst.title('Probe OK')\nst.write('hello from probe')\n",
    "docs/index.html": "<html><body>docs</body></html>",
  },
  gradio: {
    "demo/main.py": "import gradio as gr\ndemo = gr.Interface(fn=lambda x: x, inputs='text', outputs='text')\ndemo.launch()\n",
  },
  // backend+UI in one repo → the visual framework must win
  "fastapi-plus-streamlit": {
    "api/server.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    "ui/streamlit_app.py": "import streamlit as st\nst.write('ui')\n",
  },
  dash: {
    "app.py": "import dash\napp = dash.Dash(__name__)\napp.run(debug=False)\n",
  },
  flask: {
    "app.py": "from flask import Flask\napp = Flask(__name__)\n@app.route('/')\ndef home():\n    return 'hi'\n",
  },
  // Django: the import scan CANNOT see it (manage.py's `from django...` is
  // indented inside main()), so this fixture proves the manage.py +
  // DJANGO_SETTINGS_MODULE path is what actually finds it.
  django: {
    "manage.py":
      "#!/usr/bin/env python\nimport os\nimport sys\n\n\ndef main():\n"
      + "    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'probesite.settings')\n"
      + "    from django.core.management import execute_from_command_line\n"
      + "    execute_from_command_line(sys.argv)\n\n\n"
      + "if __name__ == '__main__':\n    main()\n",
    "probesite/__init__.py": "",
    "probesite/settings.py":
      "from pathlib import Path\nBASE_DIR = Path(__file__).resolve().parent.parent\n"
      + "SECRET_KEY = 'probe'\nDEBUG = False\nALLOWED_HOSTS = []\n"
      + "INSTALLED_APPS = ['django.contrib.contenttypes', 'django.contrib.auth']\n"
      + "ROOT_URLCONF = 'probesite.urls'\nMIDDLEWARE = []\nTEMPLATES = []\n"
      + "DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}\n"
      + "USE_TZ = True\nSTATIC_URL = 'static/'\n",
    "probesite/urls.py":
      "from django.http import HttpResponse\nfrom django.urls import path\n"
      + "urlpatterns = [path('', lambda r: HttpResponse('<h1>Probe Django OK</h1>'))]\n",
    "probesite/wsgi.py": "",
  },
  // a Django project that ALSO has a streamlit UI: the visual framework wins,
  // same rule as fastapi-plus-streamlit.
  "django-plus-streamlit": {
    "manage.py":
      "import os\n\n\ndef main():\n"
      + "    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'site2.settings')\n",
    "site2/settings.py": "SECRET_KEY = 'x'\n",
    "ui/streamlit_app.py": "import streamlit as st\nst.write('ui')\n",
  },
  // manage.py with NO DJANGO_SETTINGS_MODULE → we must NOT claim django (we would
  // have no settings module to wrap, and would serve DisallowedHost).
  "manage-no-settings": {
    "manage.py": "import sys\nprint('not django', sys.argv)\n",
  },
  // no web framework → must return null (falls through to static/not-a-webapp)
  none: {
    "util.py": "import json\nprint(json.dumps({'x': 1}))\n",
    "requirements.txt": "requests\n",
  },
};

async function main() {
  const skipE2e = process.argv.includes("--skip-e2e");

  console.log("[probe] part 1 — detection fixtures (one sandbox)");
  const sandbox = await Sandbox.create("nookframe-builder", { timeoutMs: 600_000 });
  try {
    for (const [name, files] of Object.entries(FIXTURES)) {
      const root = `/tmp/fix/${name}`;
      for (const [rel, content] of Object.entries(files)) {
        await sandbox.files.write(`${root}/${rel}`, content);
      }
    }

    const st = await detectPythonApp(sandbox, "/tmp/fix/streamlit-decoy");
    assert("streamlit detected despite decoy index.html", st?.framework === "streamlit", JSON.stringify(st));
    assert("streamlit entry = app.py", st?.entry === "app.py", st?.entry ?? "null");
    assert("streamlit ports = [3000]", JSON.stringify(st?.ports) === "[3000]", JSON.stringify(st?.ports));

    const gr = await detectPythonApp(sandbox, "/tmp/fix/gradio");
    assert("gradio detected", gr?.framework === "gradio", JSON.stringify(gr));
    assert("gradio entry = demo/main.py", gr?.entry === "demo/main.py", gr?.entry ?? "null");

    const both = await detectPythonApp(sandbox, "/tmp/fix/fastapi-plus-streamlit");
    assert("UI framework beats backend (streamlit > fastapi)", both?.framework === "streamlit", JSON.stringify(both));

    const da = await detectPythonApp(sandbox, "/tmp/fix/dash");
    assert("dash detected", da?.framework === "dash", JSON.stringify(da));
    assert("dash probes 8050 first", JSON.stringify(da?.ports) === "[8050,3000]", JSON.stringify(da?.ports));

    const fl = await detectPythonApp(sandbox, "/tmp/fix/flask");
    assert("flask detected", fl?.framework === "flask", JSON.stringify(fl));

    const dj = await detectPythonApp(sandbox, "/tmp/fix/django");
    assert("django detected via manage.py (import scan is blind to it)", dj?.framework === "django", JSON.stringify(dj));
    assert("django entry = manage.py", dj?.entry === "manage.py", dj?.entry ?? "null");
    assert(
      "django settings module read from manage.py",
      dj?.settingsModule === "probesite.settings",
      dj?.settingsModule ?? "null",
    );
    assert("django ports = [3000]", JSON.stringify(dj?.ports) === "[3000]", JSON.stringify(dj?.ports));

    const djSt = await detectPythonApp(sandbox, "/tmp/fix/django-plus-streamlit");
    assert("UI framework beats django (streamlit > django)", djSt?.framework === "streamlit", JSON.stringify(djSt));

    const noSettings = await detectPythonApp(sandbox, "/tmp/fix/manage-no-settings");
    assert(
      "manage.py without DJANGO_SETTINGS_MODULE → not django",
      noSettings === null,
      JSON.stringify(noSettings),
    );

    const none = await detectPythonApp(sandbox, "/tmp/fix/none");
    assert("no framework → null", none === null, JSON.stringify(none));

    console.log("[probe] part 2 — servePython on the streamlit fixture (pip install for real)");
    if (st) {
      const served = await servePython(sandbox, "/tmp/fix/streamlit-decoy", st, {});
      const health = await fetch(`${served.url}/_stcore/health`, { signal: AbortSignal.timeout(10_000) })
        .then((r) => r.text())
        .catch((e) => `fetch failed: ${e}`);
      assert("streamlit health endpoint says ok", health.trim() === "ok", health.slice(0, 120));
      const root = await fetch(served.url, { signal: AbortSignal.timeout(10_000) });
      assert("streamlit root responds 200", root.status === 200, `status ${root.status}`);
      // NOTE: don't call served.close() — it would kill the shared fixture sandbox
      // mid-probe; the finally below tears the whole sandbox down once.
    } else {
      assert("servePython skipped (detection failed)", false);
    }

    console.log("[probe] part 2b — servePython on the django fixture (pip install django for real)");
    // Part 2 left streamlit holding :3000 — two servers in one sandbox is the
    // port clash that has bitten this probe before. Free the port first.
    await sandbox.commands
      .run("pkill -f streamlit; sleep 2; exit 0")
      .catch(() => {});
    const djApp = await detectPythonApp(sandbox, "/tmp/fix/django");
    if (djApp?.framework === "django") {
      const served = await servePython(sandbox, "/tmp/fix/django", djApp, {});
      const wrapper = await sandbox.files
        .read("/tmp/fix/django/nf_demo_settings.py")
        .catch(() => "");
      assert(
        "wrapper settings extends the creator's module without editing it",
        wrapper.includes("from probesite.settings import *") && wrapper.includes('ALLOWED_HOSTS = ["*"]'),
        wrapper.slice(0, 120),
      );
      const untouched = await sandbox.files.read("/tmp/fix/django/probesite/settings.py").catch(() => "");
      assert(
        "creator's settings.py is left untouched",
        untouched.includes("ALLOWED_HOSTS = []") && !untouched.includes('ALLOWED_HOSTS = ["*"]'),
        untouched.slice(-120),
      );
      const root = await fetch(served.url, { signal: AbortSignal.timeout(15_000) });
      const body = await root.text().catch(() => "");
      assert("django root responds 200 (not 400 DisallowedHost)", root.status === 200, `status ${root.status}`);
      assert("django serves the real page", body.includes("Probe Django OK"), body.slice(0, 160));
    } else {
      assert("servePython(django) skipped (detection failed)", false);
    }
  } finally {
    await sandbox.kill().catch(() => {});
  }

  if (!skipE2e) {
    console.log("[probe] part 3 — github E2E (streamlit/streamlit-example)");
    const built = await buildAndServe("github", "https://github.com/streamlit/streamlit-example");
    try {
      const health = await fetch(`${built.url}/_stcore/health`, { signal: AbortSignal.timeout(10_000) })
        .then((r) => r.text())
        .catch((e) => `fetch failed: ${e}`);
      assert("E2E: cloned repo serves streamlit (health ok)", health.trim() === "ok", health.slice(0, 120));
    } finally {
      await built.close();
    }
  } else {
    console.log("[probe] part 3 skipped (--skip-e2e)");
  }

  console.log(`\n[probe] ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("[probe] crashed:", e);
  process.exit(1);
});
