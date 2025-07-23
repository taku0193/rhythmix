import math

def score_pose(user_pose: dict, template_pose: dict, threshold: float = 0.1) -> float:
    matched = 0
    total = 0
    for key, tp in template_pose.items():
        total += 1
        if key in user_pose:
            ux, uy = user_pose[key]
            tx, ty = tp
            if math.hypot(ux - tx, uy - ty) <= threshold:
                matched += 1
    return matched / total if total else 0.0