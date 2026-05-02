/**
 * effects-db.js
 *
 * Two exports:
 *   BUILT_IN_EFFECTS  — array of all native Premiere Pro effects (video + audio)
 *   EffectsSearch     — constructor for the in-memory fuzzy search engine
 *
 * Each entry:
 *   { name, matchName, category, type }
 *   type: "video" | "audio"
 *   matchName: Adobe internal identifier used by components.addComponent()
 */

/* global window */

'use strict';

var BUILT_IN_EFFECTS = [

  // ── ADJUST ──────────────────────────────────────────────────────────────
  { name: 'Auto Color',                   matchName: 'ADBE Auto Color',                       category: 'Adjust',              type: 'video' },
  { name: 'Auto Contrast',                matchName: 'ADBE Auto Contrast',                    category: 'Adjust',              type: 'video' },
  { name: 'Auto Levels',                  matchName: 'ADBE Auto Levels',                      category: 'Adjust',              type: 'video' },
  { name: 'Convolution Kernel',           matchName: 'ADBE Convolution Kernel',               category: 'Adjust',              type: 'video' },
  { name: 'Extract',                      matchName: 'ADBE Extract',                          category: 'Adjust',              type: 'video' },
  { name: 'Levels',                       matchName: 'ADBE Levels',                           category: 'Adjust',              type: 'video' },
  { name: 'Levels (Individual Controls)', matchName: 'ADBE Levels2',                          category: 'Adjust',              type: 'video' },
  { name: 'Posterize',                    matchName: 'ADBE Posterize',                        category: 'Adjust',              type: 'video' },
  { name: 'Threshold',                    matchName: 'ADBE Threshold',                        category: 'Adjust',              type: 'video' },

  // ── BLUR & SHARPEN ───────────────────────────────────────────────────────
  { name: 'Camera Blur',                  matchName: 'ADBE Camera Blur',                      category: 'Blur & Sharpen',      type: 'video' },
  { name: 'Channel Blur',                 matchName: 'ADBE Channel Blur',                     category: 'Blur & Sharpen',      type: 'video' },
  { name: 'Compound Blur',                matchName: 'ADBE Compound Blur',                    category: 'Blur & Sharpen',      type: 'video' },
  { name: 'Directional Blur',             matchName: 'ADBE Motion Blur',                      category: 'Blur & Sharpen',      type: 'video' },
  { name: 'Fast Blur',                    matchName: 'ADBE Fast Blur',                        category: 'Blur & Sharpen',      type: 'video' },
  { name: 'Gaussian Blur',                matchName: 'ADBE Gaussian Blur 2',                  category: 'Blur & Sharpen',      type: 'video' },
  { name: 'Lens Blur',                    matchName: 'ADBE Lens Blur',                        category: 'Blur & Sharpen',      type: 'video' },
  { name: 'Sharpen',                      matchName: 'ADBE Sharpen',                          category: 'Blur & Sharpen',      type: 'video' },
  { name: 'Smart Blur',                   matchName: 'ADBE Smart Blur',                       category: 'Blur & Sharpen',      type: 'video' },
  { name: 'Unsharp Mask',                 matchName: 'ADBE Unsharp Mask',                     category: 'Blur & Sharpen',      type: 'video' },

  // ── CHANNEL ─────────────────────────────────────────────────────────────
  { name: 'Arithmetic',                   matchName: 'ADBE Arithmetic',                       category: 'Channel',             type: 'video' },
  { name: 'Blend',                        matchName: 'ADBE Blend',                            category: 'Channel',             type: 'video' },
  { name: 'Calculations',                 matchName: 'ADBE Calculations',                     category: 'Channel',             type: 'video' },
  { name: 'Compound Arithmetic',          matchName: 'ADBE Compound Arithmetic',              category: 'Channel',             type: 'video' },
  { name: 'Invert',                       matchName: 'ADBE Invert',                           category: 'Channel',             type: 'video' },
  { name: 'Minimax',                      matchName: 'ADBE Minimax',                          category: 'Channel',             type: 'video' },
  { name: 'Remove Color Matting',         matchName: 'ADBE Remove Color Matting',             category: 'Channel',             type: 'video' },
  { name: 'Set Channels',                 matchName: 'ADBE Set Channels',                     category: 'Channel',             type: 'video' },
  { name: 'Set Matte',                    matchName: 'ADBE Set Matte',                        category: 'Channel',             type: 'video' },
  { name: 'Shift Channels',               matchName: 'ADBE Shift Channels',                   category: 'Channel',             type: 'video' },
  { name: 'Solid Composite',              matchName: 'ADBE Solid Composite',                  category: 'Channel',             type: 'video' },

  // ── COLOR CORRECTION ────────────────────────────────────────────────────
  { name: 'ASC CDL',                      matchName: 'ADBE ASC CDL',                          category: 'Color Correction',    type: 'video' },
  { name: 'Black & White',                matchName: 'ADBE Black&White',                      category: 'Color Correction',    type: 'video' },
  { name: 'Brightness & Contrast',        matchName: 'ADBE Brightness & Contrast 2',          category: 'Color Correction',    type: 'video' },
  { name: 'Broadcast Colors',             matchName: 'ADBE Broadcast Colors',                 category: 'Color Correction',    type: 'video' },
  { name: 'Change Color',                 matchName: 'ADBE Change Color',                     category: 'Color Correction',    type: 'video' },
  { name: 'Change to Color',              matchName: 'ADBE Change Color2',                    category: 'Color Correction',    type: 'video' },
  { name: 'Channel Mixer',                matchName: 'ADBE Channel Mixer',                    category: 'Color Correction',    type: 'video' },
  { name: 'Color Balance',                matchName: 'ADBE Color Balance',                    category: 'Color Correction',    type: 'video' },
  { name: 'Color Balance (HLS)',          matchName: 'ADBE Color Balance (HLS)',              category: 'Color Correction',    type: 'video' },
  { name: 'Color Match',                  matchName: 'ADBE Color Match',                      category: 'Color Correction',    type: 'video' },
  { name: 'Equalize',                     matchName: 'ADBE Equalize',                         category: 'Color Correction',    type: 'video' },
  { name: 'Fast Color Corrector',         matchName: 'ADBE Fast Color Corrector',             category: 'Color Correction',    type: 'video' },
  { name: 'Gamma Correction',             matchName: 'ADBE Gamma Correction',                 category: 'Color Correction',    type: 'video' },
  { name: 'Hue/Saturation',               matchName: 'ADBE HUE/SATURATION',                  category: 'Color Correction',    type: 'video' },
  { name: 'Leave Color',                  matchName: 'ADBE Leave Color',                      category: 'Color Correction',    type: 'video' },
  { name: 'Lumetri Color',                matchName: 'AEVideoFilter ADBE Lumetri',            category: 'Color Correction',    type: 'video' },
  { name: 'Luma Corrector',               matchName: 'ADBE Luma Corrector',                   category: 'Color Correction',    type: 'video' },
  { name: 'Luma Curve',                   matchName: 'ADBE Luma Curve',                       category: 'Color Correction',    type: 'video' },
  { name: 'RGB Color Corrector',          matchName: 'ADBE RGB Color Corrector',              category: 'Color Correction',    type: 'video' },
  { name: 'RGB Curves',                   matchName: 'ADBE RGB Curves',                       category: 'Color Correction',    type: 'video' },
  { name: 'Three-Way Color Corrector',    matchName: 'ADBE Three-Way Color Corrector',        category: 'Color Correction',    type: 'video' },
  { name: 'Tint',                         matchName: 'ADBE Tint',                             category: 'Color Correction',    type: 'video' },
  { name: 'Video Limiter',                matchName: 'ADBE Video Limiter',                    category: 'Color Correction',    type: 'video' },

  // ── DISTORT ─────────────────────────────────────────────────────────────
  { name: 'Bezier Warp',                  matchName: 'ADBE Bezier Warp',                      category: 'Distort',             type: 'video' },
  { name: 'Corner Pin',                   matchName: 'ADBE Corner Pin',                       category: 'Distort',             type: 'video' },
  { name: 'Lens Distortion',              matchName: 'ADBE Optics Compensation',              category: 'Distort',             type: 'video' },
  { name: 'Magnify',                      matchName: 'ADBE Magnify',                          category: 'Distort',             type: 'video' },
  { name: 'Mirror',                       matchName: 'ADBE Mirror',                           category: 'Distort',             type: 'video' },
  { name: 'Offset',                       matchName: 'ADBE Offset',                           category: 'Distort',             type: 'video' },
  { name: 'Polar Coordinates',            matchName: 'ADBE Polar Coordinates',                category: 'Distort',             type: 'video' },
  { name: 'Ripple',                       matchName: 'ADBE Ripple',                           category: 'Distort',             type: 'video' },
  { name: 'Rolling Shutter Repair',       matchName: 'ADBE Rolling Shutter',                  category: 'Distort',             type: 'video' },
  { name: 'Spherize',                     matchName: 'ADBE Spherize',                         category: 'Distort',             type: 'video' },
  { name: 'Transform',                    matchName: 'ADBE Transform',                        category: 'Distort',             type: 'video' },
  { name: 'Turbulent Displace',           matchName: 'ADBE Turbulent Displace',               category: 'Distort',             type: 'video' },
  { name: 'Twirl',                        matchName: 'ADBE Twirl',                            category: 'Distort',             type: 'video' },
  { name: 'Warp Stabilizer',              matchName: 'ADBE Warp Stabilizer - MBM',            category: 'Distort',             type: 'video' },
  { name: 'Wave Warp',                    matchName: 'ADBE Wave Warp',                        category: 'Distort',             type: 'video' },

  // ── GENERATE ────────────────────────────────────────────────────────────
  { name: '4-Color Gradient',             matchName: 'ADBE 4-Color Gradient',                 category: 'Generate',            type: 'video' },
  { name: 'Cell Pattern',                 matchName: 'ADBE Cell Pattern',                     category: 'Generate',            type: 'video' },
  { name: 'Checkerboard',                 matchName: 'ADBE Checkerboard',                     category: 'Generate',            type: 'video' },
  { name: 'Circle',                       matchName: 'ADBE Circle',                           category: 'Generate',            type: 'video' },
  { name: 'Ellipse',                      matchName: 'ADBE Ellipse',                          category: 'Generate',            type: 'video' },
  { name: 'Eyedropper Fill',              matchName: 'ADBE Eyedropper Fill',                  category: 'Generate',            type: 'video' },
  { name: 'Fill',                         matchName: 'ADBE Fill',                             category: 'Generate',            type: 'video' },
  { name: 'Grid',                         matchName: 'ADBE Grid',                             category: 'Generate',            type: 'video' },
  { name: 'Lens Flare',                   matchName: 'ADBE Lens Flare',                       category: 'Generate',            type: 'video' },
  { name: 'Paint Bucket',                 matchName: 'ADBE Paint Bucket',                     category: 'Generate',            type: 'video' },
  { name: 'Ramp',                         matchName: 'ADBE Ramp',                             category: 'Generate',            type: 'video' },
  { name: 'Stroke',                       matchName: 'ADBE Stroke',                           category: 'Generate',            type: 'video' },
  { name: 'Write-on',                     matchName: 'ADBE Write-on',                         category: 'Generate',            type: 'video' },

  // ── IMAGE CONTROL ────────────────────────────────────────────────────────
  { name: 'Color Pass',                   matchName: 'ADBE Color Pass',                       category: 'Image Control',       type: 'video' },
  { name: 'Color Replace',                matchName: 'ADBE Color Replace',                    category: 'Image Control',       type: 'video' },
  { name: 'Median (Legacy)',              matchName: 'ADBE Median (old2)',                     category: 'Image Control',       type: 'video' },

  // ── KEYING ──────────────────────────────────────────────────────────────
  { name: 'Alpha Adjust',                 matchName: 'ADBE Alpha Levels',                     category: 'Keying',              type: 'video' },
  { name: 'Color Key',                    matchName: 'ADBE Color Key',                        category: 'Keying',              type: 'video' },
  { name: 'Difference Matte',             matchName: 'ADBE Difference Matte',                 category: 'Keying',              type: 'video' },
  { name: 'Eight-Point Garbage Matte',    matchName: 'ADBE Eight-Point Garbage Matte',        category: 'Keying',              type: 'video' },
  { name: 'Four-Point Garbage Matte',     matchName: 'ADBE Four-Point Garbage Matte',         category: 'Keying',              type: 'video' },
  { name: 'Image Matte Key',              matchName: 'ADBE Image Matte',                      category: 'Keying',              type: 'video' },
  { name: 'Luma Key',                     matchName: 'ADBE Luma Key',                         category: 'Keying',              type: 'video' },
  { name: 'Non Red Key',                  matchName: 'ADBE Non Red Key',                      category: 'Keying',              type: 'video' },
  { name: 'Remove Matte',                 matchName: 'ADBE Remove Matte',                     category: 'Keying',              type: 'video' },
  { name: 'RGB Difference Key',           matchName: 'ADBE RGB Difference Key',               category: 'Keying',              type: 'video' },
  { name: 'Sixteen-Point Garbage Matte',  matchName: 'ADBE Sixteen-Point Garbage Matte',      category: 'Keying',              type: 'video' },
  { name: 'Track Matte Key',              matchName: 'ADBE Track Matte Key',                  category: 'Keying',              type: 'video' },
  { name: 'Ultra Key',                    matchName: 'ADBE Keying - Serious Chromakey',        category: 'Keying',              type: 'video' },

  // ── NOISE & GRAIN ───────────────────────────────────────────────────────
  { name: 'Dust & Scratches',             matchName: 'ADBE Dust & Scratches',                 category: 'Noise & Grain',       type: 'video' },
  { name: 'Median',                       matchName: 'ADBE Median',                           category: 'Noise & Grain',       type: 'video' },
  { name: 'Noise',                        matchName: 'ADBE Noise',                            category: 'Noise & Grain',       type: 'video' },
  { name: 'Noise Alpha',                  matchName: 'ADBE Noise Alpha',                      category: 'Noise & Grain',       type: 'video' },
  { name: 'Noise HLS',                    matchName: 'ADBE Noise HLS',                        category: 'Noise & Grain',       type: 'video' },
  { name: 'Noise HLS Auto',               matchName: 'ADBE Noise HLS Auto',                   category: 'Noise & Grain',       type: 'video' },

  // ── PERSPECTIVE ─────────────────────────────────────────────────────────
  { name: 'Basic 3D',                     matchName: 'ADBE Basic 3D',                         category: 'Perspective',         type: 'video' },
  { name: 'Bevel Alpha',                  matchName: 'ADBE Bevel Alpha',                      category: 'Perspective',         type: 'video' },
  { name: 'Bevel Edges',                  matchName: 'ADBE Bevel Edges',                      category: 'Perspective',         type: 'video' },
  { name: 'Drop Shadow',                  matchName: 'ADBE Drop Shadow',                      category: 'Perspective',         type: 'video' },
  { name: 'Radial Shadow',                matchName: 'ADBE Radial Shadow',                    category: 'Perspective',         type: 'video' },

  // ── STYLIZE ─────────────────────────────────────────────────────────────
  { name: 'Alpha Glow',                   matchName: 'ADBE Alpha Glow',                       category: 'Stylize',             type: 'video' },
  { name: 'Brush Strokes',                matchName: 'ADBE Brush Strokes',                    category: 'Stylize',             type: 'video' },
  { name: 'Color Emboss',                 matchName: 'ADBE Color Emboss',                     category: 'Stylize',             type: 'video' },
  { name: 'Emboss',                       matchName: 'ADBE Emboss',                           category: 'Stylize',             type: 'video' },
  { name: 'Find Edges',                   matchName: 'ADBE Find Edges',                       category: 'Stylize',             type: 'video' },
  { name: 'Glow',                         matchName: 'ADBE Glow',                             category: 'Stylize',             type: 'video' },
  { name: 'Mosaic',                       matchName: 'ADBE Mosaic',                           category: 'Stylize',             type: 'video' },
  { name: 'Motion Tile',                  matchName: 'ADBE Motion Tile',                      category: 'Stylize',             type: 'video' },
  { name: 'Posterize Time',               matchName: 'ADBE Posterize Time',                   category: 'Stylize',             type: 'video' },
  { name: 'Replicate',                    matchName: 'ADBE Replicate',                        category: 'Stylize',             type: 'video' },
  { name: 'Roughen Edges',                matchName: 'ADBE Roughen Edges',                    category: 'Stylize',             type: 'video' },
  { name: 'Scatter',                      matchName: 'ADBE Scatter',                          category: 'Stylize',             type: 'video' },
  { name: 'Solarize',                     matchName: 'ADBE Solarize',                         category: 'Stylize',             type: 'video' },
  { name: 'Strobe Light',                 matchName: 'ADBE Strobe Light',                     category: 'Stylize',             type: 'video' },
  { name: 'Texturize',                    matchName: 'ADBE Texturize',                        category: 'Stylize',             type: 'video' },

  // ── TIME ────────────────────────────────────────────────────────────────
  { name: 'Echo',                         matchName: 'ADBE Echo',                             category: 'Time',                type: 'video' },
  { name: 'Pixel Motion Blur',            matchName: 'ADBE PixMotionBlur',                    category: 'Time',                type: 'video' },

  // ── TRANSFORM ───────────────────────────────────────────────────────────
  { name: 'Camera View',                  matchName: 'ADBE Camera View',                      category: 'Transform',           type: 'video' },
  { name: 'Clip',                         matchName: 'ADBE Clip',                             category: 'Transform',           type: 'video' },
  { name: 'Crop',                         matchName: 'ADBE Crop',                             category: 'Transform',           type: 'video' },
  { name: 'Edge Feather',                 matchName: 'ADBE Edge Feather',                     category: 'Transform',           type: 'video' },
  { name: 'Flip Horizontal',              matchName: 'ADBE Horizontal Flip',                  category: 'Transform',           type: 'video' },
  { name: 'Flip Vertical',                matchName: 'ADBE Vertical Flip',                    category: 'Transform',           type: 'video' },

  // ── VIDEO ───────────────────────────────────────────────────────────────
  { name: 'SDR Conform',                  matchName: 'ADBE SDR Conform',                      category: 'Video',               type: 'video' },
  { name: 'Timecode',                     matchName: 'ADBE Timecode',                         category: 'Video',               type: 'video' },

  // ════════════════════════════════════════════════════════════════════════
  // AUDIO EFFECTS
  // ════════════════════════════════════════════════════════════════════════

  // ── AMPLITUDE & COMPRESSION ─────────────────────────────────────────────
  { name: 'Channel Volume',               matchName: 'ADBE Channel Volume',                   category: 'Amplitude & Compression', type: 'audio' },
  { name: 'Dynamics Processing',          matchName: 'ADBE Dynamics',                         category: 'Amplitude & Compression', type: 'audio' },
  { name: 'Hard Limiter',                 matchName: 'ADBE Hard Limiter',                     category: 'Amplitude & Compression', type: 'audio' },
  { name: 'Multiband Compressor',         matchName: 'ADBE Multiband Compressor',             category: 'Amplitude & Compression', type: 'audio' },
  { name: 'Single-band Compressor',       matchName: 'ADBE Single-band Compressor',           category: 'Amplitude & Compression', type: 'audio' },
  { name: 'Tube-modeled Compressor',      matchName: 'ADBE Tube-modeled Compressor',          category: 'Amplitude & Compression', type: 'audio' },

  // ── DELAY & ECHO ────────────────────────────────────────────────────────
  { name: 'Analog Delay',                 matchName: 'ADBE Analog Delay',                     category: 'Delay & Echo',        type: 'audio' },
  { name: 'Delay',                        matchName: 'ADBE Delay',                            category: 'Delay & Echo',        type: 'audio' },
  { name: 'Multitap Delay',               matchName: 'ADBE Multitap Delay',                   category: 'Delay & Echo',        type: 'audio' },

  // ── FILTER & EQ ─────────────────────────────────────────────────────────
  { name: 'Bass',                         matchName: 'ADBE Bass',                             category: 'Filter & EQ',         type: 'audio' },
  { name: 'DeEsser',                      matchName: 'ADBE DeEsser',                          category: 'Filter & EQ',         type: 'audio' },
  { name: 'FFT Filter',                   matchName: 'ADBE FFT Filter',                       category: 'Filter & EQ',         type: 'audio' },
  { name: 'Graphic Equalizer (10 Band)',   matchName: 'ADBE Graphic Equalizer (10 Band)',      category: 'Filter & EQ',         type: 'audio' },
  { name: 'Graphic Equalizer (20 Band)',   matchName: 'ADBE Graphic Equalizer (20 Band)',      category: 'Filter & EQ',         type: 'audio' },
  { name: 'Graphic Equalizer (30 Band)',   matchName: 'ADBE Graphic Equalizer (30 Band)',      category: 'Filter & EQ',         type: 'audio' },
  { name: 'Highpass',                     matchName: 'ADBE Highpass',                         category: 'Filter & EQ',         type: 'audio' },
  { name: 'Lowpass',                      matchName: 'ADBE Lowpass',                          category: 'Filter & EQ',         type: 'audio' },
  { name: 'Notch Filter',                 matchName: 'ADBE Notch Filter',                     category: 'Filter & EQ',         type: 'audio' },
  { name: 'Parametric Equalizer',         matchName: 'ADBE Parametric Equalizer',             category: 'Filter & EQ',         type: 'audio' },
  { name: 'Scientific Filters',           matchName: 'ADBE Scientific Filters',               category: 'Filter & EQ',         type: 'audio' },
  { name: 'Treble',                       matchName: 'ADBE Treble',                           category: 'Filter & EQ',         type: 'audio' },

  // ── MODULATION ──────────────────────────────────────────────────────────
  { name: 'Chorus/Flanger',               matchName: 'ADBE Chorus/Flanger',                   category: 'Modulation',          type: 'audio' },
  { name: 'Flanger',                      matchName: 'ADBE Flanger',                          category: 'Modulation',          type: 'audio' },
  { name: 'Phaser',                       matchName: 'ADBE Phaser',                           category: 'Modulation',          type: 'audio' },

  // ── NOISE REDUCTION ─────────────────────────────────────────────────────
  { name: 'Adaptive Noise Reduction',     matchName: 'ADBE Adaptive Noise Reduction',         category: 'Noise Reduction',     type: 'audio' },
  { name: 'Auto Click Remover',           matchName: 'ADBE Auto Click Remover',               category: 'Noise Reduction',     type: 'audio' },
  { name: 'Denoise',                      matchName: 'ADBE Denoise',                          category: 'Noise Reduction',     type: 'audio' },
  { name: 'Hum Remover',                  matchName: 'ADBE Hum Remover',                      category: 'Noise Reduction',     type: 'audio' },

  // ── REVERB ──────────────────────────────────────────────────────────────
  { name: 'Convolution Reverb',           matchName: 'ADBE Convolution Reverb',               category: 'Reverb',              type: 'audio' },
  { name: 'Reverb',                       matchName: 'ADBE Reverb',                           category: 'Reverb',              type: 'audio' },
  { name: 'Studio Reverb',                matchName: 'ADBE Studio Reverb',                    category: 'Reverb',              type: 'audio' },

  // ── SPECIAL ─────────────────────────────────────────────────────────────
  { name: 'Distortion',                   matchName: 'ADBE Distortion',                       category: 'Special',             type: 'audio' },
  { name: 'Guitar Suite',                 matchName: 'ADBE Guitar Suite',                     category: 'Special',             type: 'audio' },
  { name: 'Mastering',                    matchName: 'ADBE Mastering',                        category: 'Special',             type: 'audio' },
  { name: 'Vocal Enhancer',               matchName: 'ADBE Vocal Enhancer',                   category: 'Special',             type: 'audio' },

  // ── STEREO IMAGERY ──────────────────────────────────────────────────────
  { name: 'Balance',                      matchName: 'ADBE Balance',                          category: 'Stereo Imagery',      type: 'audio' },
  { name: 'Fill Left',                    matchName: 'ADBE Fill Left',                        category: 'Stereo Imagery',      type: 'audio' },
  { name: 'Fill Right',                   matchName: 'ADBE Fill Right',                       category: 'Stereo Imagery',      type: 'audio' },
  { name: 'Stereo Expander',              matchName: 'ADBE Stereo Expander',                  category: 'Stereo Imagery',      type: 'audio' },

  // ── TIME & PITCH ────────────────────────────────────────────────────────
  { name: 'Auto Tune',                    matchName: 'ADBE Auto Tune',                        category: 'Time & Pitch',        type: 'audio' },
  { name: 'Doppler Shifter',              matchName: 'ADBE Doppler Shifter',                  category: 'Time & Pitch',        type: 'audio' },
  { name: 'Manual Pitch Corrector',       matchName: 'ADBE Manual Pitch Corrector',           category: 'Time & Pitch',        type: 'audio' },
  { name: 'Pitch Shifter',                matchName: 'ADBE Pitch Shifter',                    category: 'Time & Pitch',        type: 'audio' },
  { name: 'Stretch and Pitch',            matchName: 'ADBE Stretch and Pitch',                category: 'Time & Pitch',        type: 'audio' },

  // ── VOLUME ──────────────────────────────────────────────────────────────
  { name: 'Volume',                       matchName: 'ADBE Volume',                           category: 'Volume',              type: 'audio' },
];

// ── Fuzzy search engine ───────────────────────────────────────────────────────

/**
 * @constructor
 * Indexes effects at init() time and exposes search() for instant queries.
 */
function EffectsSearch() {
  this._db = [];
}

/**
 * Build the index from built-in effects + user presets.
 * @param {Array} builtins
 * @param {Array} presets
 */
EffectsSearch.prototype.init = function (builtins, presets) {
  this._db = builtins.concat(presets).map(function (e) {
    return Object.assign({}, e, {
      _nameLower:     e.name.toLowerCase(),
      _categoryLower: (e.category || '').toLowerCase(),
    });
  });
};

/**
 * Search the index.
 * @param  {string} rawQuery
 * @returns {Array} Up to 60 scored result objects.
 */
EffectsSearch.prototype.search = function (rawQuery) {
  var q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  var results = [];
  var db = this._db;

  for (var i = 0; i < db.length; i++) {
    var item = db[i];
    var score = this._score(item, q);
    if (score > 0) {
      results.push({
        name:       item.name,
        matchName:  item.matchName,
        category:   item.category,
        type:       item.type,
        isPreset:   item.isPreset || false,
        presetPath: item.presetPath || '',
        presetName: item.presetName || item.name || '',
        sourceFile: item.sourceFile || '',
        score:      score,
        highlight:  this._highlight(item.name, q),
      });
    }
  }

  results.sort(function (a, b) { return b.score - a.score; });
  return results.slice(0, 60);
};

EffectsSearch.prototype._score = function (item, q) {
  var n = item._nameLower;
  var c = item._categoryLower;

  // Exact name match
  if (n === q) return 1000;

  // Name starts with query
  if (n.indexOf(q) === 0) return 900 - n.length;

  // A word in the name starts with query
  var words = n.split(/[\s\-_\/&]+/);
  for (var i = 0; i < words.length; i++) {
    if (words[i].indexOf(q) === 0) return 800 - n.length;
  }

  // Name contains query anywhere
  var pos = n.indexOf(q);
  if (pos !== -1) return 700 - pos;

  // Category contains query
  if (c.indexOf(q) !== -1) return 400;

  // Abbreviation: initials of words match query  (e.g. "gb" → Gaussian Blur)
  if (words.length >= 2) {
    var initials = words.map(function (w) { return w[0] || ''; }).join('');
    if (initials.indexOf(q) !== -1) return 500;
  }

  // Fuzzy: all query chars appear in order in the name
  if (this._fuzzyMatch(n, q)) return 200;

  return 0;
};

EffectsSearch.prototype._fuzzyMatch = function (str, query) {
  var qi = 0;
  for (var i = 0; i < str.length && qi < query.length; i++) {
    if (str[i] === query[qi]) qi++;
  }
  return qi === query.length;
};

EffectsSearch.prototype._escapeHtml = function (value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

EffectsSearch.prototype._highlight = function (name, q) {
  name = String(name == null ? '' : name);
  var lower = name.toLowerCase();
  var idx = lower.indexOf(q);
  if (idx === -1) return this._escapeHtml(name);
  return (
    this._escapeHtml(name.slice(0, idx)) +
    '<mark>' + this._escapeHtml(name.slice(idx, idx + q.length)) + '</mark>' +
    this._escapeHtml(name.slice(idx + q.length))
  );
};

// Expose globals
window.BUILT_IN_EFFECTS = BUILT_IN_EFFECTS;
window.EffectsSearch    = EffectsSearch;
