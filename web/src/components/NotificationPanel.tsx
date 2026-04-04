import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Menu,
  Typography,
} from "@mui/material";
import type { ReminderNotification } from "../hooks/useReminderNotifications";

const categoryLabel: Record<string, string> = {
  medication: "Medication",
  exercise: "Exercise",
  consultation: "Consultation",
};

type Props = {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  notifications: ReminderNotification[];
  onDismiss: (dismissKey: string) => void;
  onClearAll: () => void;
  onToggle: (el: HTMLElement) => void;
};

export default function NotificationPanel({
  anchorEl,
  open,
  onClose,
  notifications,
  onDismiss,
  onClearAll,
  onToggle,
}: Props) {
  const count = notifications.length;

  return (
    <>
      <IconButton
        color="inherit"
        aria-label="Reminders"
        onClick={(e) => onToggle(e.currentTarget)}
        size="large"
      >
        <Badge badgeContent={count} color="secondary" max={99}>
          <NotificationsNoneIcon />
        </Badge>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={onClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { width: 360, maxWidth: "calc(100vw - 24px)" } }}
      >
        <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Reminders
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Fires on your device clock (daily / weekly / monthly / yearly).
          </Typography>
        </Box>
        <Divider />
        {notifications.length === 0 ? (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              No active reminders right now. Add them under Settings.
            </Typography>
          </Box>
        ) : (
          <>
            <List dense disablePadding sx={{ maxHeight: 320, overflow: "auto" }}>
              {notifications.map((n) => (
                <ListItem
                  key={n.id}
                  secondaryAction={
                    <Button size="small" onClick={() => onDismiss(n.dismissKey)}>
                      Dismiss
                    </Button>
                  }
                  alignItems="flex-start"
                  sx={{ pr: 10, py: 1 }}
                >
                  <ListItemText
                    primary={n.title}
                    secondary={categoryLabel[n.category] ?? n.category}
                    primaryTypographyProps={{ fontWeight: 500 }}
                  />
                </ListItem>
              ))}
            </List>
            <Divider />
            <Box sx={{ px: 1, py: 1, display: "flex", justifyContent: "flex-end" }}>
              <Button size="small" onClick={onClearAll}>
                Clear all
              </Button>
            </Box>
          </>
        )}
      </Menu>
    </>
  );
}
