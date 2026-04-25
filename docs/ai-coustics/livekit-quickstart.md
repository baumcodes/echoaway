> ## Documentation Index
> Fetch the complete documentation index at: https://docs.ai-coustics.com/llms.txt
> Use this file to discover all available pages before exploring further.

# LiveKit Quickstart

> Learn how to use the ai-coustics plugin in your LiveKit applications for real-time speech enhancement.

Integrate ai-coustics speech enhancement into your LiveKit voice agents in minutes. The `livekit-plugins-ai-coustics` package provides real-time noise cancellation optimized for human-to-machine audio, improving transcription accuracy for your AI agents.

<Info>
  Requires a **LiveKit Cloud account** for authentication, no ai-coustics SDK key needed.
</Info>

## Setup Guide

Follow these steps to create a new LiveKit agent project with ai-coustics speech enhancement.

<Steps>
  <Step title="Create a LiveKit Cloud account">
    Sign up at [LiveKit Cloud](https://cloud.livekit.io/) if you don't already have an account. **Note:** A LiveKit Cloud account is required for authentication. The plugin runs locally on your infrastructure.
  </Step>

  <Step title="Install the LiveKit CLI">
    Install the [LiveKit CLI tool](https://github.com/livekit/livekit-cli) for your platform.
  </Step>

  <Step title="Authenticate the CLI">
    ```sh theme={null}
    lk cloud auth
    ```
  </Step>

  <Step title="Create a new agent project">
    ```sh theme={null}
    lk app create --template agent-starter-python my-agent
    cd my-agent
    ```
  </Step>

  <Step title="Add the ai-coustics plugin">
    ```sh theme={null}
    uv add livekit-plugins-ai-coustics
    ```
  </Step>

  <Step title="Install dependencies">
    ```sh theme={null}
    uv sync
    ```
  </Step>

  <Step title="Download model files">
    ```sh theme={null}
    uv run src/agent.py download-files
    ```
  </Step>

  <Step title="Enable speech enhancement">
    Open `src/agent.py` and update the `session.start()` call to include audio enhancement:

    ```python theme={null}
    from livekit.plugins import ai_coustics

    session = AgentSession(
      vad=ai_coustics.VAD(),  # Add ai-coustics VAD to session setup
      # ...
    )

    await session.start(
        agent=Assistant(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(  
                  # Add ai-coustics audio enhancement to audio input options
                  noise_cancellation=ai_coustics.audio_enhancement(
                    # - EnhancerModel.QUAIL_VF_L  (best for isolating the foreground speaker)
                    # - EnhancerModel.QUAIL_L     (best for multiple speakers)
                    model=ai_coustics.EnhancerModel.QUAIL_VF_L,
                    # - enhancement_level = 0.5 (conservative, foreground speech is always preserved)
                    # - enhancement_level = 0.8 (balanced, optimal word error rate on challenging data)
                    # - enhancement_level = 1.0 (aggressive, maximum suppression of interfering speech)
                    # More info: https://docs.ai-coustics.com/guides/speech-enhancement-for-asr
                    model_parameters=ai_coustics.ModelParameters(enhancement_level=0.8),
                    # VAD Parameters Info: https://docs.ai-coustics.com/guides/voice-activity-detection
                    vad_settings=ai_coustics.VadSettings(
                      # 0.0 to 1.0 seconds
                      speech_hold_duration=0.03,
                      # 1.0 to 15.0
                      sensitivity=6.0,
                      # 0.0 to 1.0 seconds
                      minimum_speech_duration=0.0,
                    )
                ),
            )
        ),
    )
    ```
  </Step>

  <Step title="Run the agent">
    ```sh theme={null}
    uv run python src/agent.py console
    ```

    <Check>
      Your agent is now running with ai-coustics Quail Voice Focus. You can start talking to it directly in the console. The Voice Focus models will elevate the foreground speaker while suppressing both interfering speech and background noise.
    </Check>
  </Step>

  <Step title="Voice Focus and Multi-Speaker Support">
    You can use [Quail Voice Focus and Quail for multi-speaker](/guides/models#quail) scenarios in this integration. Support for [Voice Activity Detection](/guides/voice-activity-detection) will be added in the future.
  </Step>
</Steps>

## Available Models

The LiveKit plugin does not currently have support for loading model files. Instead, it has a limited selection of models embedded in the plugin itself.

The models currently available in the plugin are:

* Quail L (16 kHz): `EnhancerModel.QUAIL_L`
* Quail Voice Focus 2.0 L (16 kHz): `EnhancerModel.QUAIL_VF_L`

Quail Voice Focus 2.1 models are not yet available in the plugin, but will be added soon in a upcoming update.

## Next Steps

<CardGroup cols={2}>
  <Card title="Plugin on PyPI" icon="code" href="https://pypi.org/project/livekit-plugins-ai-coustics/">
    Discover the LiveKit Plugin documentation.
  </Card>

  <Card title="Quail & Voice Focus" icon="microphone" href="/guides/models#quail">
    Learn about Quail and Voice Focus models for LiveKit.
  </Card>
</CardGroup>
