// components/LoginModal.tsx
"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MagicCard } from "@/components/magicui/magic-card";

export function Login({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { theme } = useTheme();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-md bg-transparent border-none shadow-none">
        <div className="dark w-full">
          <Card className="p-0 w-full shadow-none border-none">
            <MagicCard
              gradientColor={theme === "dark" ? "#262626" : "#D9D9D955"}
              className="p-0"
            >
              <CardHeader className="border-b border-border p-4">
                <CardTitle>Login</CardTitle>
                <CardDescription>
                  Enter your credentials to access your account
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <form>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="name@example.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="password">Password</Label>
                      <Input id="password" type="password" />
                    </div>
                  </div>
                </form>
              </CardContent>
              <CardFooter className="p-4 border-t border-border">
                <Button className="w-full">Sign In</Button>
              </CardFooter>
            </MagicCard>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
