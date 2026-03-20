export const PRESETS = [
  {
    id: 'fashion_4_5',
    name: 'Fashion / Instagram Portrait (4:5)',
    json: {
      "user_intent": "High-end fashion portrait for Instagram feed",
      "meta": {
        "aspect_ratio": "4:5",
        "quality": "ultra_photorealistic",
        "safety_filter": "standard",
        "seed": 12345,
        "guidance_scale": 7.5
      },
      "subject": {
        "characters": [
          {
            "id": "model",
            "type": "human",
            "gender": "female",
            "age": "23-30",
            "body_type": "slim",
            "clothing": {
              "style": "high-fashion editorial",
              "items": ["tailored blazer", "minimalist top"],
              "color_palette": ["black", "white", "beige"]
            },
            "pose": "standing, one hand in pocket, slight head tilt",
            "facial_expression": "confident, neutral gaze into camera",
            "hair": {
              "length": "medium",
              "style": "sleek straight",
              "color": "dark brown"
            },
            "identity_constraints": "match reference face if provided"
          }
        ]
      },
      "scene": {
        "environment": "studio",
        "location_details": "seamless paper backdrop",
        "time_of_day": "n/a",
        "weather": "n/a",
        "background_elements": [
          "smooth gradient backdrop"
        ],
        "foreground_elements": []
      },
      "composition": {
        "camera_type": "full_frame_dslr",
        "lens_focal_length_mm": 85,
        "aperture": "f/2.0",
        "shutter_speed": "1/160",
        "iso": 100,
        "framing": "medium_close_up",
        "angle": "eye_level",
        "camera_movement": "static",
        "depth_of_field": "shallow",
        "focus_point": "eyes"
      },
      "color_and_light": {
        "color_palette": "neutral_with_subtle_warm_skin",
        "key_light_direction": "from_right",
        "lighting_style": "softbox_key_with_fill",
        "contrast": "medium_high",
        "saturation": "natural"
      },
      "postprocessing": {
        "grading_style": "fashion_magazine_clean",
        "sharpness": "high",
        "grain": "very_subtle",
        "vignette": "minimal",
        "skin_smoothing": "light"
      },
      "text_rendering": {
        "enabled": false
      }
    }
  },
  {
    id: 'lifestyle_9_16',
    name: 'Lifestyle / TikTok Reels (9:16)',
    json: {
      "user_intent": "Lifestyle vertical image for TikTok / Reels cover",
      "meta": {
        "aspect_ratio": "9:16",
        "quality": "ultra_photorealistic",
        "safety_filter": "standard",
        "seed": 9876,
        "guidance_scale": 7.0
      },
      "subject": {
        "characters": [
          {
            "id": "creator",
            "type": "human",
            "gender": "female",
            "age": "20-35",
            "body_type": "athletic",
            "clothing": {
              "style": "casual lifestyle",
              "items": ["oversized hoodie", "leggings", "sneakers"],
              "color_palette": ["pastel beige", "soft gray", "white"]
            },
            "pose": "walking toward camera, one hand holding coffee cup",
            "facial_expression": "genuine smile, energetic",
            "hair": {
              "length": "long",
              "style": "slightly messy natural",
              "color": "light brown"
            },
            "identity_constraints": "consistent across all shots"
          }
        ]
      },
      "scene": {
        "environment": "city_street",
        "location_details": "trendy neighborhood with cafes",
        "time_of_day": "morning",
        "weather": "clear",
        "background_elements": [
          "blurred cafe signs",
          "pedestrians in soft focus"
        ],
        "foreground_elements": []
      },
      "composition": {
        "camera_type": "mirrorless",
        "lens_focal_length_mm": 35,
        "aperture": "f/2.8",
        "shutter_speed": "1/400",
        "iso": 160,
        "framing": "full_body_vertical",
        "angle": "slightly_low_angle",
        "camera_movement": "tracking_forward",
        "depth_of_field": "medium_shallow",
        "focus_point": "face"
      },
      "color_and_light": {
        "color_palette": "soft_pastel_city",
        "key_light_direction": "natural_front",
        "lighting_style": "soft_daylight",
        "contrast": "medium",
        "saturation": "slightly_vibrant"
      },
      "postprocessing": {
        "grading_style": "influencer_lifestyle_pastel",
        "sharpness": "medium_high",
        "grain": "minimal",
        "vignette": "subtle",
        "skin_smoothing": "light"
      },
      "text_rendering": {
        "enabled": true,
        "text": "Morning Routine Hacks",
        "font_style": "bold_sans_serif",
        "placement": "top_center_safe_area",
        "color": "white_with_soft_drop_shadow"
      }
    }
  }
];
